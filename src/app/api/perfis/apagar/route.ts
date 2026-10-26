import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { deleteAccount } from "@/lib/repo";
import { removeAccountStorage } from "@/lib/media-cleanup";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ id?: string }>(req);
    if (!body?.id) return bad("id obrigatório.");
    const removed = await removeAccountStorage(body.id);
    await deleteAccount(body.id);
    return ok({ storage_removed: removed });
  } catch (err) {
    return fail(err);
  }
}
