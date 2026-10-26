import { fail, guard, ok } from "@/lib/api";
import { tick } from "@/lib/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Botão "Rodar agora" do topo — mesma coisa que o cron faz, sob demanda. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const result = await tick(`manual-${Date.now().toString(36)}`);
    return ok({ steps: result.steps, stopped: result.stopped_reason, ms: result.ms });
  } catch (err) {
    return fail(err);
  }
}
