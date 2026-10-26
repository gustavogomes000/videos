import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/env";
import { findActiveCampaign, getAccount, log, updateAccount } from "@/lib/repo";
import { exchangeCode, fetchUserInfo, saveTokenForAccount } from "@/lib/tiktok/oauth";
import { readState } from "@/lib/tiktok/state";

export const runtime = "nodejs";

function back(message: string, tone: "erro" | "ok" = "erro") {
  return NextResponse.redirect(new URL(`/perfis?${tone}=${encodeURIComponent(message)}`, appBaseUrl()));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error");
  const accountId = readState(url.searchParams.get("state"));

  if (denied) return back(`Autorização recusada no TikTok (${denied}).`);
  if (!code || !accountId) return back("Callback sem código ou com estado inválido.");

  const account = await getAccount(accountId);
  if (!account) return back("Perfil não encontrado.");

  try {
    const redirectUri = `${appBaseUrl()}/api/tiktok/callback`;
    const token = await exchangeCode(code, redirectUri);
    const me = await fetchUserInfo(token.access_token).catch(() => null);

    await saveTokenForAccount(accountId, token);
    await findActiveCampaign(accountId);
    if (me) {
      await updateAccount(accountId, {
        username: me.display_username ?? account.username,
        avatar_url: me.avatar_url ?? account.avatar_url,
        nickname: me.display_username ?? null,
      });
    }

    await log({
      account_id: accountId,
      kind: "connect",
      message: `Perfil @${me?.display_username ?? token.open_id.slice(0, 10)} conectado. Escopos: ${token.scope}.`,
    });
    return back(`Perfil conectado${me?.display_username ? ` como @${me.display_username}` : ""}.`, "ok");
  } catch (err) {
    return back(err instanceof Error ? err.message : "Falha ao concluir a conexão.");
  }
}
