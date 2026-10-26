import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { getMedia, log, updateAccount, updateMedia } from "@/lib/repo";

export const runtime = "nodejs";

/** Modo assistido: você publicou no app e confirma aqui. A agenda libera o próximo. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ id?: string; post_url?: string }>(req);
    if (!body?.id) return bad("id obrigatório.");
    const item = await getMedia(body.id);
    if (!item) return bad("Item não encontrado.");

    const now = new Date().toISOString();
    await updateMedia(item.id, {
      status: "published",
      published_at: now,
      public_post_url: body.post_url?.trim() || item.public_post_url,
      error: null,
      attempts: 0,
      lease_until: null,
      locked_by: null,
    });
    await updateAccount(item.account_id, { last_post_at: now });
    await log({ account_id: item.account_id, media_id: item.id, kind: "published", message: "Confirmado por você no modo assistido." });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
