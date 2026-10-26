import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { db, TABLE } from "@/lib/db";
import { getAccount, getActiveCampaign, insertMedia, log, maxPosition } from "@/lib/repo";
import { normalizeShareUrl, videoIdFromUrl } from "@/lib/media";

export const runtime = "nodejs";

/**
 * Cola a lista de links e eles entram na fila NA ORDEM colada.
 * Duplicados (mesmo id de vídeo) são descartados.
 */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ account_id?: string; urls?: string[] }>(req);
    if (!body?.account_id || !Array.isArray(body.urls) || !body.urls.length) return bad("account_id e urls são obrigatórios.");
    if (body.urls.length > 500) return bad("Máximo de 500 links por vez.");

    const account = await getAccount(body.account_id);
    if (!account) return bad("Perfil não encontrado.");
    const campaign = await getActiveCampaign(account.id);

    const rejected: string[] = [];
    const clean: { url: string; videoId: string | null }[] = [];
    for (const raw of body.urls) {
      const url = normalizeShareUrl(String(raw));
      if (!url) {
        rejected.push(String(raw).slice(0, 40));
        continue;
      }
      clean.push({ url, videoId: videoIdFromUrl(url) });
    }

    // Descarta o que já está na fila pelo id do vídeo, para não postar duas vezes.
    const wanted = clean.map((c) => c.videoId).filter((x): x is string => Boolean(x));
    const taken = new Set<string>();
    if (wanted.length) {
      const existing = await db().from(TABLE.media).select("tiktok_video_id").eq("campaign_id", campaign.id).in("tiktok_video_id", wanted);
      if (existing.error) throw existing.error;
      for (const row of existing.data ?? []) taken.add(String((row as { tiktok_video_id: string }).tiktok_video_id));
    }

    const fresh = clean.filter((c) => !c.videoId || !taken.has(c.videoId));

    let added = 0;
    if (fresh.length) {
      let pos = await maxPosition(campaign.id);
      const rows = fresh.map((c) => {
        pos += 1000;
        return {
          campaign_id: campaign.id,
          account_id: account.id,
          position: pos,
          source_kind: "url" as const,
          source_url: c.url,
          tiktok_video_id: c.videoId,
          status: "queued" as const,
        };
      });
      await insertMedia(rows);
      added = rows.length;
    }

    await log({
      account_id: account.id,
      kind: "import",
      message: `${added} link(s) entraram na fila na ordem colada${rejected.length ? `; ${rejected.length} recusados` : ""}.`,
    });

    return ok({ added, rejected });
  } catch (err) {
    return fail(err);
  }
}
