import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { checkPassword, createSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!env.appPassword) {
    return NextResponse.json({ error: "Defina APP_PASSWORD em .env.local antes de entrar." }, { status: 500 });
  }
  const body = (await req.json().catch(() => ({}))) as { senha?: string };
  if (!checkPassword(String(body.senha ?? ""))) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }
  await createSession();
  return NextResponse.json({ ok: true });
}
