import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/env";
import { log, updateAccount } from "@/lib/repo";
import { isAuthed } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.redirect(new URL("/entrar", req.url));
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.redirect(new URL("/perfis", req.url));

  await updateAccount(id, { token_enc: null, open_id: null, scopes: null, token_expires_at: null, refresh_expires_at: null, mode: "assisted" });
  await log({ account_id: id, kind: "connect", level: "warn", message: "Token removido. O perfil volta ao modo assistido." });
  return NextResponse.redirect(new URL("/perfis", appBaseUrl()));
}
