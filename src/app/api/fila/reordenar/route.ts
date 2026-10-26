import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { getMedia, listMedia, log, moveMedia } from "@/lib/repo";

export const runtime = "nodejs";

/** Arrastou a linha: grava a nova posição e não mexe no resto da fila. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ id?: string; before_id?: string | null }>(req);
    if (!body?.id) return bad("id obrigatório.");
    const item = await getMedia(body.id);
    if (!item) return bad("Item não encontrado.");

    await moveMedia(item.campaign_id, item.id, body.before_id ?? null);
    const items = await listMedia(item.campaign_id);
    const position = items.findIndex((i) => i.id === item.id) + 1;
    await log({ account_id: item.account_id, media_id: item.id, kind: "schedule", message: `Ordem corrigida: agora é o ${position}º da fila.` });
    return ok({ position });
  } catch (err) {
    return fail(err);
  }
}
