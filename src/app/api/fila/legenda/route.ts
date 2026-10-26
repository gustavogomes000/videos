import { bad, bodyAs, fail, guard, ok, str } from "@/lib/api";
import { getMedia, log, updateMedia } from "@/lib/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ id?: string; caption?: string }>(req);
    if (!body?.id) return bad("id obrigatório.");
    const item = await getMedia(body.id);
    if (!item) return bad("Item não encontrado.");

    const caption = str(body.caption ?? "", 2000).trim();
    await updateMedia(item.id, { caption: caption || null });
    await log({ account_id: item.account_id, media_id: item.id, kind: "import", message: caption ? "Legenda individual definida." : "Legenda individual apagada: volta a usar a geral." });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
