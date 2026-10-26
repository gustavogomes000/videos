import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { updateAccount } from "@/lib/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ id?: string; running?: boolean }>(req);
    if (!body?.id || typeof body.running !== "boolean") return bad("id e running obrigatórios.");
    const patch: Record<string, unknown> = { running: body.running };
    // Ligar um perfil desabilitado não faria sentido: o cron o ignoraria.
    if (body.running) patch.enabled = true;
    await updateAccount(body.id, patch);
    return ok();
  } catch (err) {
    return fail(err);
  }
}
