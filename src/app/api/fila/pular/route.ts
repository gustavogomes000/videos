import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { getMedia, log, updateMedia } from "@/lib/repo";

export const runtime = "nodejs";

/** Tira o vídeo da fila sem apagar nada — fica marcado como pulado. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ id?: string }>(req);
    if (!body?.id) return bad("id obrigatório.");
    const item = await getMedia(body.id);
    if (!item) return bad("Item não encontrado.");

    await updateMedia(item.id, { status: "skipped", scheduled_at: null, lease_until: null, locked_by: null, error: null });
    await log({ account_id: item.account_id, media_id: item.id, level: "warn", kind: "schedule", message: "Vídeo pulado; os horários seguintes fecham o buraco." });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
