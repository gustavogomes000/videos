import { env } from "./env";
import { explainError } from "./db";
import { buildVideoPath, downloadIntoStorage, resolveTikTokUrl, signedUrl } from "./media";
import { planSchedule } from "./scheduler";
import {
  claimDueScheduled,
  claimPublishing,
  claimWork,
  findActiveCampaign,
  getAccount,
  listAccounts,
  listMedia,
  log,
  releaseLease,
  updateAccount,
  updateMedia,
} from "./repo";
import type { Campaign, MediaItem, TikTokAccount } from "./types";
import { getValidToken } from "./tiktok/oauth";
import { initFileUpload, initFromUrl, postUrlFromId, publishStatus, pushChunk } from "./tiktok/publish";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 90_000;

export interface StepReport {
  action: string;
  media_id: string | null;
  detail: string;
}

function backoffMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

async function fail(item: MediaItem, message: string, extra: Record<string, unknown> = {}) {
  const attempts = item.attempts + 1;
  const permanent = attempts >= MAX_ATTEMPTS;
  await updateMedia(item.id, {
    attempts,
    error: message.slice(0, 500),
    status: permanent ? "failed" : item.status,
    next_attempt_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
    ...extra,
  });
  await log({
    account_id: item.account_id,
    media_id: item.id,
    level: permanent ? "error" : "warn",
    kind: "step_failed",
    message: permanent ? `Encerrado após ${attempts} tentativas: ${message}` : `Tentativa ${attempts}: ${message}`,
  });
  return permanent;
}

// ------------------------------------------------------------------ 1) download

/** Busca o arquivo de um item importado por link. Um por vez, o tikwm limita a 1 req/s. */
export async function stepDownloadOne(workerId: string): Promise<StepReport | null> {
  const item = await claimWork(await activeAccountIds(), workerId, LEASE_MS, ["queued"], { onlyWithoutFile: true });
  if (!item) return null;

  try {
    if (!item.source_url || (item.source_kind !== "url" && item.source_kind !== "official")) {
      await updateMedia(item.id, { status: "awaiting_upload", error: "Sem link de origem — envie o arquivo." });
      await releaseLease(item.id);
      return { action: "needs_upload", media_id: item.id, detail: "Falta o arquivo" };
    }

    await updateMedia(item.id, { status: "fetching", error: null });

    // A lista oficial já vem com o endereço direto do arquivo; o link público
    // colado por você precisa ser resolvido primeiro.
    const resolved =
      item.source_kind === "official"
        ? {
            video_id: item.tiktok_video_id,
            title: item.original_title ?? "",
            duration_sec: item.duration_sec,
            cover_url: null,
            download_url: item.source_url,
            author: null,
          }
        : await resolveTikTokUrl(item.source_url);

    if (!resolved.download_url) throw new Error("O resolvedor não devolveu o arquivo.");

    const path = buildVideoPath(item.account_id, item.id, "video/mp4", resolved.download_url);
    const downloaded = await downloadIntoStorage({
      url: resolved.download_url,
      path,
      contentType: "video/mp4",
      maxBytes: 512 * 1024 * 1024,
    });

    // 'ready' sem scheduled_at = arquivo no cofre, aguardando o planejador abrir vaga.
    await updateMedia(item.id, {
      status: "ready",
      storage_path: path,
      mime_type: "video/mp4",
      filename: path.split("/").pop() ?? `${item.id}.mp4`,
      size_bytes: downloaded.size || null,
      duration_sec: resolved.duration_sec ?? item.duration_sec,
      original_title: item.original_title || resolved.title,
      tiktok_video_id: item.tiktok_video_id ?? resolved.video_id,
      attempts: 0,
      error: null,
    });
    await log({
      account_id: item.account_id,
      media_id: item.id,
      kind: "download",
      message: `Arquivo baixado e guardado (${(downloaded.size / 1e6).toFixed(1)} MB).`,
    });
    await releaseLease(item.id);
    return { action: "downloaded", media_id: item.id, detail: path };
  } catch (err) {
    const message = explainError(err);
    const permanent = await fail(item, message);
    if (permanent) {
      // Não trava a fila: pede o arquivo manual e segue o baile.
      await updateMedia(item.id, { status: "awaiting_upload" });
    }
    await releaseLease(item.id);
    return { action: "download_failed", media_id: item.id, detail: message };
  }
}

// ------------------------------------------------------------------- 2) agenda

/** Distribui horário na fila, em ordem, para tudo que já tem arquivo. */
export async function stepSchedule(): Promise<StepReport | null> {
  const accounts = await listAccounts();
  for (const account of accounts) {
    if (!account.enabled || !account.running) continue;
    const campaign = await findActiveCampaign(account.id);
    if (!campaign) continue;
    const items = await listMedia(campaign.id);
    const pending = items.filter((i) => i.storage_path && !i.scheduled_at && i.status === "ready");
    if (!pending.length) continue;

    const plan = await planSchedule(account, pending);
    await log({
      account_id: account.id,
      kind: "schedule",
      message: `${plan.assigned.length} vídeo(s) posicionado(s) na agenda a cada ${account.interval_minutes} min, teto de ${account.daily_cap}/dia.`,
      meta: { first: plan.firstAt, last: plan.lastAt, days: plan.daysSpanned },
    });
    return { action: "scheduled", media_id: pending[0].id, detail: `${plan.assigned.length} agendados` };
  }
  return null;
}

// ------------------------------------------------- 3) hora de postar (dois modos)

export async function stepDueNow(workerId: string): Promise<StepReport | null> {
  const item = await claimDueScheduled(workerId, LEASE_MS);
  if (!item) return null;

  const account = await getAccount(item.account_id);
  if (!account) {
    await updateMedia(item.id, { status: "failed", error: "Perfil não existe mais." });
    await releaseLease(item.id);
    return { action: "orphan", media_id: item.id, detail: "Perfil removido" };
  }

  if (account.mode === "assisted") {
    await updateMedia(item.id, { status: "awaiting_manual", error: null });
    await log({ account_id: account.id, media_id: item.id, kind: "manual_ready", message: "Chegou a hora: é só tocar em Publicar no TikTok." });
    await releaseLease(item.id);
    return { action: "awaiting_manual", media_id: item.id, detail: "Sua vez" };
  }

  if (!account.open_id) {
    await updateMedia(item.id, { error: "Perfil não conectado ao TikTok." });
    await releaseLease(item.id);
    return { action: "not_connected", media_id: item.id, detail: "Conecte o perfil" };
  }

  try {
    const campaign = await findActiveCampaign(account.id);
    if (!campaign) throw new Error("Campanha do perfil não encontrada.");
    const token = await getValidToken(account.id);
    const started = await startPublish(item, account, campaign, token.access_token);
    await releaseLease(item.id);
    return started;
  } catch (err) {
    const message = explainError(err);
    await fail(item, message);
    await releaseLease(item.id);
    return { action: "publish_failed", media_id: item.id, detail: message };
  }
}

async function startPublish(item: MediaItem, account: TikTokAccount, campaign: Campaign, accessToken: string): Promise<StepReport> {
  if (!item.storage_path) throw new Error("O vídeo ainda não tem arquivo.");
  const url = await signedUrl(item.storage_path, 2 * 60 * 60);
  if (!url) throw new Error("Não consegui gerar a URL assinada do arquivo.");

  const coverUrl = campaign.cover_path ? await signedUrl(campaign.cover_path, 2 * 60 * 60) : null;
  const post = {
    title: composeCaption(campaign, item),
    privacy_level: campaign.privacy_level,
    disable_comment: campaign.disable_comment,
    disable_duet: campaign.disable_duet,
    disable_stitch: campaign.disable_stitch,
    brand_content_toggle: false,
    brand_organic_toggle: campaign.brand_organic,
    is_aigc: false,
  };

  try {
    const init = await initFromUrl({ token: accessToken, post, externalUrl: url, coverUrl });
    await updateMedia(item.id, {
      status: "publishing",
      publish_id: init.publish_id,
      attempts: 0,
      error: null,
      next_attempt_at: new Date(Date.now() + 20_000).toISOString(),
      upload_url: init.upload_url ?? null,
    });
    await log({ account_id: account.id, media_id: item.id, kind: "publish_init", message: "Enviado ao TikTok, aguardando confirmação." });
    return { action: "publishing", media_id: item.id, detail: init.publish_id };
  } catch (err) {
    const message = explainError(err);
    // Se o TikTok recusar o link externo, tentamos empurrar o arquivo em pedaços.
    if (!/url|link|download|external/i.test(message)) throw err;
    if (!item.size_bytes) throw new Error(`${message} E também falta o tamanho do arquivo para o envio em pedaços.`);

    const init = await initFileUpload({ token: accessToken, post, videoSize: item.size_bytes });
    const totalChunks = Math.max(1, Math.ceil(item.size_bytes / env.chunkSize));
    await updateMedia(item.id, {
      status: "uploading",
      publish_id: init.publish_id,
      upload_url: init.upload_url ?? null,
      upload_seq: 0,
      total_chunks: totalChunks,
      chunk_size: env.chunkSize,
      error: null,
      next_attempt_at: new Date().toISOString(),
    });
    await log({ account_id: account.id, media_id: item.id, kind: "upload_init", message: `Link externo recusado; enviando em ${totalChunks} pedaço(s).` });
    return { action: "uploading", media_id: item.id, detail: init.publish_id };
  }
}

export function composeCaption(campaign: Campaign, item: MediaItem): string {
  const personal = (item.caption ?? "").trim();
  const base = personal || campaign.general_caption.trim();
  const tags = campaign.general_hashtags.trim();
  const withTags = tags ? `${base}${base ? " " : ""}${tags}` : base;
  return withTags.trim();
}

// ----------------------------------------------------------- 4) enviar pedaços

export async function stepUploadChunks(workerId: string): Promise<StepReport | null> {
  const item = await claimWork(await activeAccountIds(), workerId, LEASE_MS, ["uploading"]);
  if (!item) return null;

  try {
    if (!item.upload_url || !item.total_chunks || !item.chunk_size || !item.storage_path) {
      throw new Error("Faltam dados do upload em pedaços.");
    }
    if (!item.publish_id) throw new Error("Sem publish_id.");

    const nextSeq = item.upload_seq + 1;
    const bytes = await fetchBytesRange(item.storage_path, (nextSeq - 1) * item.chunk_size, item.chunk_size, item.size_bytes ?? 0);

    await pushChunk({
      uploadUrl: item.upload_url,
      bytes,
      seq: nextSeq,
      totalChunks: item.total_chunks,
      videoSize: item.size_bytes ?? bytes.byteLength,
    });

    const done = nextSeq >= item.total_chunks;
    await updateMedia(item.id, {
      upload_seq: nextSeq,
      status: done ? "publishing" : "uploading",
      next_attempt_at: new Date(done ? Date.now() + 20_000 : Date.now()).toISOString(),
      error: null,
    });
    if (done) await log({ account_id: item.account_id, media_id: item.id, kind: "upload_done", message: "Arquivo completo recebido pelo TikTok." });

    // Enquanto couber no orçamento do tick, emenda o próximo pedaço.
    await releaseLease(item.id);
    return { action: done ? "uploaded" : "chunk", media_id: item.id, detail: `${nextSeq}/${item.total_chunks}` };
  } catch (err) {
    const message = explainError(err);
    await fail(item, message);
    await releaseLease(item.id);
    return { action: "upload_failed", media_id: item.id, detail: message };
  }
}

async function fetchBytesRange(path: string, start: number, length: number, total: number): Promise<ArrayBuffer> {
  const url = await signedUrl(path, 15 * 60);
  if (!url) throw new Error("Não consegui gerar a URL do arquivo.");
  const end = Math.min(total - 1, start + length - 1);
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, cache: "no-store" });
  if (!res.ok && res.status !== 206) throw new Error(`Leitura do arquivo falhou (${res.status}).`);
  return res.arrayBuffer();
}

// ------------------------------------------------------- 5) confirmar publicação

export async function stepPollStatus(workerId: string): Promise<StepReport | null> {
  const item = await claimPublishing(workerId, LEASE_MS);
  if (!item) return null;

  try {
    if (!item.publish_id) throw new Error("Sem publish_id para consultar.");
    const token = await getValidToken(item.account_id);
    const status = await publishStatus(token.access_token, item.publish_id);

    if (status.status === "PUBLISH_COMPLETE") {
      const ids = Array.isArray(status.publicaly_available_post_id)
        ? status.publicaly_available_post_id
        : status.publicaly_available_post_id
          ? [status.publicaly_available_post_id]
          : [];
      const postId = ids[0] ?? null;
      await updateMedia(item.id, {
        status: "published",
        published_at: new Date().toISOString(),
        public_post_url: postUrlFromId(postId),
        error: null,
        attempts: 0,
      });
      await updateAccount(item.account_id, { last_post_at: new Date().toISOString() });
      await log({ account_id: item.account_id, media_id: item.id, kind: "published", message: "Publicado no TikTok.", meta: { post_id: postId } });
      await releaseLease(item.id);
      return { action: "published", media_id: item.id, detail: postId ?? "" };
    }

    if (status.status === "FAILED") {
      throw new Error(status.fail_reason || "O TikTok recusou a publicação.");
    }

    if (status.status === "SEND_TO_USER") {
      // App sem auditoria: o TikTok entrega o rascunho na conta em vez de publicar.
      await updateMedia(item.id, { status: "awaiting_manual", error: "Rascunho enviado ao app do TikTok (app ainda não auditado)." });
      await log({ account_id: item.account_id, media_id: item.id, level: "warn", kind: "send_to_user", message: "O TikTok devolveu como rascunho no app. Aprovação do app libera a publicação direta." });
      await releaseLease(item.id);
      return { action: "send_to_user", media_id: item.id, detail: "Rascunho" };
    }

    await updateMedia(item.id, {
      next_attempt_at: new Date(Date.now() + 20_000).toISOString(),
      error: null,
    });
    await releaseLease(item.id);
    return { action: "still_processing", media_id: item.id, detail: status.status };
  } catch (err) {
    const message = explainError(err);
    await fail(item, message);
    await releaseLease(item.id);
    return { action: "status_failed", media_id: item.id, detail: message };
  }
}

// ------------------------------------------------------------------------- tick

let accountIdsCache: { ids: string[]; at: number } | null = null;

async function activeAccountIds(): Promise<string[]> {
  if (accountIdsCache && Date.now() - accountIdsCache.at < 15_000) return accountIdsCache.ids;
  const accounts = await listAccounts();
  const ids = accounts.filter((a) => a.enabled && a.running).map((a) => a.id);
  accountIdsCache = { ids, at: Date.now() };
  return ids;
}

export interface TickResult {
  steps: StepReport[];
  stopped_reason: "budget" | "nothing_to_do" | "error";
  ms: number;
}

/**
 * Uma passada do worker. Cada passo é pequeno, idempotente e retomável:
 * se o Vercel cortar a função, o próximo tick continua de onde parou
 * porque o estado vive no banco, não na memória.
 */
export async function tick(workerId = `w-${Date.now().toString(36)}`): Promise<TickResult> {
  const started = Date.now();
  const budget = env.tickBudgetMs;
  const steps: StepReport[] = [];
  const queue: Array<(workerId: string) => Promise<StepReport | null>> = [
    stepDownloadOne,
    stepSchedule,
    stepUploadChunks,
    stepDueNow,
    stepPollStatus,
  ];

  let idleRounds = 0;
  while (Date.now() - started < budget && idleRounds < queue.length) {
    let didSomething = false;
    for (const run of queue) {
      if (Date.now() - started >= budget) break;
      try {
        const report = await run(workerId);
        if (report) {
          steps.push(report);
          didSomething = true;
        }
      } catch (err) {
        await log({ level: "error", kind: "tick", message: explainError(err) });
        return { steps, stopped_reason: "error", ms: Date.now() - started };
      }
    }
    idleRounds = didSomething ? 0 : idleRounds + 1;
  }

  return { steps, stopped_reason: Date.now() - started >= budget ? "budget" : "nothing_to_do", ms: Date.now() - started };
}
