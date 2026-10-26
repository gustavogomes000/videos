import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { safeEqual, signPayload, verifySignature } from "./crypto";

export const SESSION_COOKIE = "fila_tiktok_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

function payload(): string {
  return "owner";
}

export async function createSession(): Promise<void> {
  const stamp = String(Date.now());
  const token = `${stamp}.${signPayload(`${payload()}.${stamp}`)}`;
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const [stamp, sig] = token.split(".");
  if (!stamp || !sig) return false;
  if (Date.now() - Number(stamp) > MAX_AGE * 1000) return false;
  return verifySignature(`${payload()}.${stamp}`, sig);
}

/** Chama no topo de toda página e de toda mutação. */
export async function requireSession(returnTo = "/"): Promise<void> {
  if (!(await isAuthed())) redirect(`/entrar?depois=${encodeURIComponent(returnTo)}`);
}

export function checkPassword(candidate: string): boolean {
  const expected = env.appPassword;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

/** Guard das rotas de cron: só aceita quem manda o segredo certo. */
export function checkCronSecret(request: Request): boolean {
  const expected = env.cronSecret;
  if (!expected) return false;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const fromQuery = new URL(request.url).searchParams.get("secret") ?? "";
  return safeEqual(header, expected) || safeEqual(fromQuery, expected);
}
