import { bad, bodyAs, fail, guard, int, ok } from "@/lib/api";
import { getActiveCampaign, getAccount, insertMedia, listMedia, log, maxPosition } from "@/lib/repo";
import { getValidToken } from "@/lib/tiktok/oauth";
import { listPublishedVideos } from "@/lib/tiktok/files";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Recupera a lista do próprio perfil pela API oficial e monta a fila
 * do mais antigo ao mais novo — a ordem original das suas publicações.
 */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ account_id?: string; limit?: number }>(req);
    if (!body?.account_id) return bad("account_id obrigatório.");

    const account = await getAccount(body.account_id);
    if (!account?.open_id) return bad("Conecte o perfil ao TikTok primeiro.");
    const campaign = await getActiveCampaign(account.id);

    const token = await getValidToken(account.id);
    const videos = await listPublishedVideos(token.access_token, account.open_id, Math.min(500, int(body.limit, 200)));
    if (!videos.length) return bad("O TikTok não devolveu nenhum vídeo. Se o escopo video.list não estiver aprovado, use a importação por links.");

    const already = new Set((await listMedia(campaign.id)).map((m) => m.tiktok_video_id).filter(Boolean));

    let pos = await maxPosition(campaign.id);
    let added = 0;
    let skipped = 0;
    const rows = [];
    for (const v of videos) {
      if (already.has(v.video_id)) {
        skipped++;
        continue;
      }
      pos += 1000;
      added++;
      rows.push({
        campaign_id: campaign.id,
        account_id: account.id,
        position: pos,
        source_kind: "official" as const,
        source_url: v.download_url,
        tiktok_video_id: v.video_id,
        original_title: v.title || null,
        duration_sec: v.duration_sec,
        width: v.width,
        height: v.height,
        // Sem endereço de download o item entra pedindo o arquivo na mão.
        status: v.download_url ? ("queued" as const) : ("awaiting_upload" as const),
      });
    }
    if (rows.length) await insertMedia(rows);

    await log({
      account_id: account.id,
      kind: "import",
      message: `${added} vídeo(s) da lista oficial entraram na fila (do mais antigo ao mais novo)${skipped ? `; ${skipped} já estavam` : ""}.`,
    });

    return ok({ added, skipped, listed: videos.length });
  } catch (err) {
    return fail(err);
  }
}
