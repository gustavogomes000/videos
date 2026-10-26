import { NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/session";
import { tick } from "@/lib/worker";
import { log } from "@/lib/repo";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(req: Request) {
  if (!checkCronSecret(req)) {
    return NextResponse.json({ error: "segredo ausente ou errado" }, { status: 401 });
  }
  try {
    const result = await tick(`cron-${Date.now().toString(36)}`);
    if (result.stopped_reason === "error") {
      await log({ level: "error", kind: "tick", message: "Rodada terminou com erro." });
    }
    return NextResponse.json({ steps: result.steps.length, actions: result.steps.map((s) => s.action), ms: result.ms });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log({ level: "error", kind: "tick", message: `Tick falhou: ${message}` });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
