import { decryptJson, encryptJson } from "../crypto";
import { env } from "../env";
import { getAccountRaw, updateAccount, log } from "../repo";
import { call, tiktok, TikTokApiError } from "./api";

export interface TokenSet {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type?: string;
}

export interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string;
  open_id: string;
  scope: string;
}

const CLOCK_SKEW = 60_000;

function toStored(t: TokenSet): StoredToken {
  const now = Date.now();
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(now + t.expires_in * 1000 - CLOCK_SKEW).toISOString(),
    refresh_expires_at: new Date(now + t.refresh_expires_in * 1000 - CLOCK_SKEW).toISOString(),
    open_id: t.open_id,
    scope: t.scope ?? tiktok.scopes,
  };
}

export function authConfigured(): boolean {
  return Boolean(env.tiktokClientKey && env.tiktokClientSecret);
}

export function authorizeUrl(redirectUri: string, state: string): string {
  if (!authConfigured()) throw new Error("Defina TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET para conectar um perfil.");
  return tiktok.authorizeUrl(env.tiktokClientKey!, redirectUri, state);
}

export async function exchangeCode(code: string, redirectUri: string): Promise<StoredToken> {
  const form = new URLSearchParams({
    client_key: env.tiktokClientKey!,
    client_secret: env.tiktokClientSecret!,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const data = await call<TokenSet>("/v2/oauth/token/", { method: "POST", form });
  return toStored(data);
}

export async function refreshStoredToken(current: StoredToken): Promise<StoredToken> {
  const form = new URLSearchParams({
    client_key: env.tiktokClientKey!,
    client_secret: env.tiktokClientSecret!,
    grant_type: "refresh_token",
    refresh_token: current.refresh_token,
  });
  const data = await call<TokenSet>("/v2/oauth/refresh/", { method: "POST", form });
  return toStored({ ...data, open_id: data.open_id || current.open_id });
}

export interface TikTokUser {
  open_id: string;
  union_id?: string;
  avatar_url?: string;
  display_username?: string;
}

export async function fetchUserInfo(accessToken: string): Promise<TikTokUser> {
  const params = new URLSearchParams({ fields: "open_id,union_id,avatar_url,display_username" });
  const data = await call<TikTokUser>(`/v2/user/info/?${params.toString()}`, { method: "GET", token: accessToken });
  return data;
}

// ------------------------------------------------------------------ persistência

export async function saveTokenForAccount(accountId: string, token: StoredToken) {
  await updateAccount(accountId, {
    token_enc: encryptJson(token),
    open_id: token.open_id,
    scopes: token.scope,
    token_expires_at: token.expires_at,
    refresh_expires_at: token.refresh_expires_at,
    connected_at: new Date().toISOString(),
  });
}

export function readToken(account: { token_enc: string | null }): StoredToken | null {
  return decryptJson<StoredToken>(account.token_enc);
}

/**
 * Devolve um access token vivo, renovando quando está vencendo.
 * access token dura 24h e o refresh 365 dias no TikTok.
 */
export async function getValidToken(accountId: string): Promise<StoredToken> {
  const raw = await getAccountRaw(accountId);
  if (!raw?.token_enc) throw new TikTokApiError("Este perfil ainda não foi conectado ao TikTok.");
  let token = readToken(raw);
  if (!token) throw new TikTokApiError("Token corrompido. Conecte o perfil de novo.");

  if (Date.now() >= new Date(token.expires_at).getTime()) {
    if (Date.now() >= new Date(token.refresh_expires_at).getTime()) {
      throw new TikTokApiError("A autorização expirou (365 dias). Conecte o perfil de novo.");
    }
    token = await refreshStoredToken(token);
    await saveTokenForAccount(accountId, token);
    await log({ account_id: accountId, kind: "token", message: "Token renovado automaticamente." });
  }
  return token;
}

export async function tokenSnapshot(accountId: string) {
  const raw = await getAccountRaw(accountId);
  const token = raw?.token_enc ? readToken(raw) : null;
  return {
    connected: Boolean(token),
    open_id: token?.open_id ?? null,
    scopes: token?.scope ?? null,
    expires_at: token?.expires_at ?? null,
    refresh_expires_at: token?.refresh_expires_at ?? null,
    needs_reconnect: token ? Date.now() >= new Date(token.refresh_expires_at).getTime() : false,
  };
}
