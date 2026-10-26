import { db, TABLE } from "./db";
import type { AccountRollup, ActivityRow, Campaign, MediaItem, MediaStatus, TikTokAccount } from "./types";

export async function listAccounts(): Promise<TikTokAccount[]> {
  const { data, error } = await db().from(TABLE.accounts).select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as TikTokAccount[];
}

export async function getAccount(id: string): Promise<TikTokAccount | null> {
  const { data, error } = await db().from(TABLE.accounts).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as TikTokAccount) ?? null;
}

export async function getAccountRaw(id: string) {
  const { data, error } = await db().from(TABLE.accounts).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as (TikTokAccount & { token_enc: string | null; open_id: string | null }) | null;
}

export async function createAccount(input: Partial<TikTokAccount> = {}): Promise<TikTokAccount> {
  const { data, error } = await db()
    .from(TABLE.accounts)
    .insert({ ...input })
    .select("*")
    .single();
  if (error) throw error;
  return data as TikTokAccount;
}

export async function updateAccount(id: string, patch: Partial<TikTokAccount> & Record<string, unknown>) {
  const { data, error } = await db().from(TABLE.accounts).update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as TikTokAccount | null;
}

export async function deleteAccount(id: string) {
  const { error } = await db().from(TABLE.accounts).delete().eq("id", id);
  if (error) throw error;
}

export async function rollup(): Promise<AccountRollup[]> {
  const { data, error } = await db().from("account_rollup").select("*");
  if (error) throw error;
  return (data ?? []) as AccountRollup[];
}

// ---------------------------------------------------------------- campaigns

export async function getActiveCampaign(accountId: string): Promise<Campaign> {
  const existing = await findActiveCampaign(accountId);
  if (existing) return existing;
  const { data, error } = await db()
    .from(TABLE.campaigns)
    .insert({ account_id: accountId })
    .select("*")
    .single();
  if (error) throw error;
  return data as Campaign;
}

export async function findActiveCampaign(accountId: string): Promise<Campaign | null> {
  const { data, error } = await db()
    .from(TABLE.campaigns)
    .select("*")
    .eq("account_id", accountId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as Campaign) ?? null;
}

export async function updateCampaign(id: string, patch: Partial<Campaign>) {
  const { data, error } = await db().from(TABLE.campaigns).update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as Campaign | null;
}

// --------------------------------------------------------------------- media

export async function listMedia(campaignId: string): Promise<MediaItem[]> {
  const { data, error } = await db()
    .from(TABLE.media)
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MediaItem[];
}

export async function getMedia(id: string): Promise<MediaItem | null> {
  const { data, error } = await db().from(TABLE.media).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as MediaItem) ?? null;
}

export async function maxPosition(campaignId: string): Promise<number> {
  const { data, error } = await db()
    .from(TABLE.media)
    .select("position")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.position;
  return last == null ? 0 : Number(last);
}

export interface NewMedia {
  campaign_id: string;
  account_id: string;
  position: number;
  source_kind: "url" | "official" | "upload";
  source_url?: string | null;
  tiktok_video_id?: string | null;
  original_title?: string | null;
  filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  duration_sec?: number | null;
  width?: number | null;
  height?: number | null;
  storage_path?: string | null;
  cover_path?: string | null;
  caption?: string | null;
  status?: MediaStatus;
}

export async function insertMedia(rows: NewMedia[]): Promise<MediaItem[]> {
  if (!rows.length) return [];
  const { data, error } = await db().from(TABLE.media).insert(rows).select("*");
  if (error) throw error;
  return (data ?? []) as MediaItem[];
}

export async function updateMedia(id: string, patch: Partial<MediaItem> & Record<string, unknown>) {
  const { data, error } = await db().from(TABLE.media).update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as MediaItem | null;
}

/**
 * Arrastar para reordenar: posiciona `movedId` logo antes de `beforeId`
 * usando a média dos vizinhos. Não precisa reescrever a fila inteira.
 */
export async function moveMedia(campaignId: string, movedId: string, beforeId: string | null) {
  const items = await listMedia(campaignId);
  const moving = items.find((i) => i.id === movedId);
  if (!moving) return;
  const others = items.filter((i) => i.id !== movedId);

  let nextPos: number;
  if (!beforeId) {
    nextPos = (others.at(-1)?.position ?? 0) + 1000;
  } else {
    const idx = others.findIndex((i) => i.id === beforeId);
    const before = others[idx];
    const prev = idx > 0 ? others[idx - 1] : null;
    nextPos = prev ? (Number(prev.position) + Number(before.position)) / 2 : Number(before.position) - 1000;
  }
  await updateMedia(movedId, { position: nextPos });
}

// ---------------------------------------------------------------------- fila

/** Itens que o worker pode pegar agora, respeitando a ordem. */
/**
 * Escolhe um item e trava só ele. `limit(1)` num PATCH do PostgREST não
 * restringe quais linhas mudam, então o claim é em dois tempos: seleciona o id
 * e refaz o mesmo filtro no update. Se outro worker levou antes, volta null.
 */
async function claimNext(
  workerId: string,
  leaseMs: number,
  where: (q: any) => any,
  order: { column: string; ascending: boolean },
): Promise<MediaItem | null> {
  const until = new Date(Date.now() + leaseMs).toISOString();

  const pick = await where(db().from(TABLE.media).select("id")).order(order.column, { ascending: order.ascending }).limit(1).maybeSingle();
  if (pick.error) throw pick.error;
  const id = (pick.data as { id: string } | null)?.id;
  if (!id) return null;

  const win = await where(db().from(TABLE.media).update({ lease_until: until, locked_by: workerId }).eq("id", id)).select("id");
  if (win.error) throw win.error;
  if (!win.data?.length) return null;

  const full = await db().from(TABLE.media).select("*").eq("id", id).maybeSingle();
  if (full.error) throw full.error;
  return (full.data as MediaItem) ?? null;
}

export async function claimWork(
  accountIds: string[],
  workerId: string,
  leaseMs: number,
  statuses: MediaStatus[],
  options: { onlyWithoutFile?: boolean } = {},
) {
  if (!accountIds.length) return null;
  const now = new Date().toISOString();
  return claimNext(
    workerId,
    leaseMs,
    (q) => {
      let out = q.in("account_id", accountIds).in("status", statuses).lte("next_attempt_at", now).or(`lease_until.is.null,lease_until.lt.${now}`);
      // "queued" também é o estado de um arquivo que acabou de descer; sem esse
      // filtro o worker baixaria o mesmo vídeo para sempre.
      if (options.onlyWithoutFile) out = out.is("storage_path", null);
      return out;
    },
    { column: "position", ascending: true },
  );
}

/** Pega o próximo da agenda que chegou a hora (assistido ou api). */
export async function claimDueScheduled(workerId: string, leaseMs: number) {
  const now = new Date().toISOString();
  return claimNext(
    workerId,
    leaseMs,
    (q) => q.eq("status", "ready").lte("scheduled_at", now).or(`lease_until.is.null,lease_until.lt.${now}`),
    { column: "scheduled_at", ascending: true },
  );
}

export async function claimPublishing(workerId: string, leaseMs: number) {
  const now = new Date().toISOString();
  return claimNext(
    workerId,
    leaseMs,
    (q) => q.eq("status", "publishing").lte("next_attempt_at", now).or(`lease_until.is.null,lease_until.lt.${now}`),
    { column: "position", ascending: true },
  );
}

export async function releaseLease(id: string) {
  const { error } = await db().from(TABLE.media).update({ lease_until: null, locked_by: null }).eq("id", id);
  if (error) console.error(error);
}

/** Quantos posts já tomaram conta de cada dia local (para o limite diário). */
export async function scheduledTimestamps(accountId: string): Promise<string[]> {
  const { data, error } = await db()
    .from(TABLE.media)
    .select("scheduled_at,published_at")
    .eq("account_id", accountId)
    .not("scheduled_at", "is", null);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { scheduled_at: string }).scheduled_at);
}

export async function listByStatus(statuses: MediaStatus[], limit = 50): Promise<MediaItem[]> {
  const { data, error } = await db()
    .from(TABLE.media)
    .select("*")
    .in("status", statuses)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as MediaItem[];
}

export async function upcoming(accountId: string, limit = 5): Promise<MediaItem[]> {
  const { data, error } = await db()
    .from(TABLE.media)
    .select("*")
    .eq("account_id", accountId)
    .in("status", ["ready", "awaiting_manual"])
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as MediaItem[];
}

// ------------------------------------------------------------------- auditoria

export async function log(input: {
  account_id?: string | null;
  media_id?: string | null;
  level?: "info" | "warn" | "error";
  kind: string;
  message: string;
  meta?: Record<string, unknown>;
}) {
  try {
    const { error } = await db().from(TABLE.log).insert({
      account_id: input.account_id ?? null,
      media_id: input.media_id ?? null,
      level: input.level ?? "info",
      kind: input.kind,
      message: input.message,
      meta: input.meta ?? {},
    });
    if (error) console.error("[log]", error.message);
  } catch (err) {
    console.error("[log]", err);
  }
}

export async function recentLog(limit = 200): Promise<ActivityRow[]> {
  const { data, error } = await db().from(TABLE.log).select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}
