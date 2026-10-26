import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { getMedia, log, updateMedia } from "@/lib/repo";

export const runtime = "nodejs";

/** Zera as tentativas e devolve o item para o passo em que parou. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ id?: string }>(req);
    if (!body?.id) return bad("id obrigatório.");
    const item = await getMedia(body.id);
    if (!item) return bad("Item não encontrado.");

    const status = item.storage_path ? "ready" : "queued";
    await updateMedia(item.id, {
      status,
      attempts: 0,
      error: null,
      next_attempt_at: new Date().toISOString(),
      lease_until: null,
      locked_by: null,
      publish_id: item.upload_url ? item.publish_id : null,
    });
    await log({ account_id: item.account_id, media_id: item.id, kind: "schedule", message: "Colocado de novo na esteira." });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
