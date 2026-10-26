import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { env } from "@/lib/env";
import { removeStorageObject } from "@/lib/media";
import { db, TABLE } from "@/lib/db";
import { getMedia, log } from "@/lib/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ id?: string }>(req);
    if (!body?.id) return bad("id obrigatório.");
    const item = await getMedia(body.id);
    if (!item) return bad("Item não encontrado.");

    if (item.storage_path) await removeStorageObject(item.storage_path);
    const { error } = await db().from(TABLE.media).delete().eq("id", item.id);
    if (error) throw error;

    await log({ account_id: item.account_id, media_id: null, level: "warn", kind: "import", message: `Removido da fila${env.storageBucket ? "" : ""}.`, meta: { filename: item.filename } });
    return ok();
  } catch (err) {
    return fail(err);
  }
}
