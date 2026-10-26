import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/env";
import { createAccount, getAccount } from "@/lib/repo";
import { isAuthed } from "@/lib/session";
import { authConfigured, authorizeUrl } from "@/lib/tiktok/oauth";
import { makeState } from "@/lib/tiktok/state";

export const runtime = "nodejs";

function backWithError(message: string) {
  return NextResponse.redirect(new URL(`/perfis?erro=${encodeURIComponent(message)}`, appBaseUrl()));
}

/**
 * Um clique, nenhuma senha digitada aqui: o TikTok mostra a tela oficial de
 * autorização e devolve um código de uso único. É o caminho que não arrisca a conta.
 */
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.redirect(new URL("/entrar", req.url));
  if (!authConfigured()) return backWithError("Preencha TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET antes de conectar.");

  const url = new URL(req.url);
  let id = url.searchParams.get("id");
  if (!id) {
    const created = await createAccount({ mode: "api" });
    id = created.id;
  }
  const account = await getAccount(id);
  if (!account) return backWithError("Perfil não encontrado.");

  const redirectUri = `${appBaseUrl()}/api/tiktok/callback`;
  return NextResponse.redirect(authorizeUrl(redirectUri, makeState(id)));
}
