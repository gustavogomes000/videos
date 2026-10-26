import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { getMedia, log, updateMedia } from "@/lib/repo";

export const runtime = "nodejs";

/** Confirma que o arquivo chegou ao Storage e libera o item para a agenda. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ media_id?: string; size?: number; mime?: string }>(req);
    if (!body?.media_id) return bad("media_id obrigatório.");
    const item = await getMedia(body.media_id);
    if (!item) return bad("Item não encontrado.");
    if (!item.storage_path) return bad("A linha ainda não tem caminho de arquivo — abra o upload pelo botão.");

    await updateMedia(item.id, {
      status: "ready",
      size_bytes: Number(body.size ?? item.size_bytes ?? 0) || null,
      mime_type: body.mime ?? item.mime_type ?? "video/mp4",
      error: null,
      attempts: 0,
    });
    await log({ account_id: item.account_id, media_id: item.id, kind: "import", message: "Arquivo recebido pelo cofre. Item pronto para a agenda." });
    return ok({ id: item.id });
  } catch (err) {
    return fail(err);
  }
}
