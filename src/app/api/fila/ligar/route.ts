import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { db, TABLE } from "@/lib/db";
import { listAccounts, log } from "@/lib/repo";

export const runtime = "nodejs";

/** Liga ou desliga a automação de todos os perfis habilitados de uma vez. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ running?: boolean }>(req);
    if (typeof body?.running !== "boolean") return bad("running obrigatório.");

    const accounts = await listAccounts();
    const targets = accounts.filter((a) => a.enabled).map((a) => a.id);
    if (targets.length) {
      const { error } = await db().from(TABLE.accounts).update({ running: body.running }).in("id", targets);
      if (error) throw error;
    }
    await log({ kind: "schedule", message: body.running ? "Automação geral ligada." : "Automação geral pausada." });
    return ok({ affected: targets.length });
  } catch (err) {
    return fail(err);
  }
}
