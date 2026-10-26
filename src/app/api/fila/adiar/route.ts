import { bad, bodyAs, fail, guard, int, ok } from "@/lib/api";
import { getMedia, log, updateMedia } from "@/lib/repo";

export const runtime = "nodejs";

/** Empurra o horário deste vídeo, mantendo a posição dele na ordem. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ id?: string; minutes?: number }>(req);
    if (!body?.id) return bad("id obrigatório.");
    const item = await getMedia(body.id);
    if (!item) return bad("Item não encontrado.");

    const minutes = Math.min(10080, Math.max(1, int(body.minutes, 60)));
    const base = item.scheduled_at ? new Date(item.scheduled_at) : new Date();
    const from = Math.max(base.getTime(), Date.now());
    const at = new Date(from + minutes * 60_000);

    await updateMedia(item.id, {
      scheduled_at: at.toISOString(),
      status: item.status === "awaiting_manual" ? "ready" : item.status,
      next_attempt_at: at.toISOString(),
      lease_until: null,
      locked_by: null,
    });
    await log({ account_id: item.account_id, media_id: item.id, kind: "schedule", message: `Adiado ${minutes} min: vai para ${at.toLocaleString("pt-BR")}.` });
    return ok({ scheduled_at: at.toISOString() });
  } catch (err) {
    return fail(err);
  }
}
