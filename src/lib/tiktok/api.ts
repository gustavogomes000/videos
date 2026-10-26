import { env } from "../env";

export class TikTokApiError extends Error {
  code?: string;
  logId?: string;
  status?: number;
  constructor(message: string, init: { code?: string; logId?: string; status?: number } = {}) {
    super(message);
    this.name = "TikTokApiError";
    this.code = init.code;
    this.logId = init.logId;
    this.status = init.status;
  }
}

const SCOPES = ["user.info.basic", "video.list", "video.publish", "video.upload"].join(",");

export const tiktok = {
  scopes: SCOPES,
  authorizeUrl(clientKey: string, redirectUri: string, state: string) {
    const u = new URL("/v2/auth/authorize/", env.tiktokAuthBase);
    u.searchParams.set("client_key", clientKey);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", SCOPES);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    return u.toString();
  },
};

interface RawResponse {
  data?: unknown;
  error?: { code?: string; message?: string; log_id?: string };
  message?: string;
}

function friendly(code: string | undefined, message: string | undefined, logId?: string): TikTokApiError {
  const hints: Record<string, string> = {
    "ok": "",
    "wrong_parameters": "Parâmetros errados na chamada.",
    "internal_error": "O TikTok teve um erro interno. Tente de novo.",
    "invalid_client": "Client key/secret não conferem. Confira TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET.",
    "invalid_grant": "Código de autorização expirado. Conecte o perfil de novo.",
    "token_expired": "Token expirou.",
    "no_permission": "Seu app ainda não tem o escopo video.publish aprovado pelo TikTok.",
    "unaudited_app": "App sem auditoria: o TikTok não libera publicação direta. Use o modo assistido até a aprovação.",
    "rate_limit_exceeded": "Limite de 6 publicações/minuto atingido. O worker espera o próximo tick.",
    "daily_publish_limit_exceeded": "Teto diário do TikTok atingido para esta conta.",
    "spam_risk_too_many_posts": "Muitos posts na conta. Aumente o intervalo entre publicações.",
    "spam_risk_user_banned_from_posting": "Conta bloqueada de publicar pelo TikTok.",
  };
  const code_ = code ?? "unknown";
  const base = message ? `${message}` : `Erro ${code_} do TikTok`;
  const hint = hints[code_] ?? "";
  const text = hint ? `${base} — ${hint}` : base;
  return new TikTokApiError(text, { code: code_, logId });
}

async function parse(res: Response): Promise<any> {
  const text = await res.text();
  let json: RawResponse | null = null;
  try {
    json = text ? (JSON.parse(text) as RawResponse) : null;
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok && !json) {
    throw new TikTokApiError(`TikTok respondeu ${res.status}: ${text.slice(0, 200)}`, { status: res.status });
  }
  const err = json?.error;
  // `code: "ok"` vem como string no v2; algumas rotas antigas devolvem 0.
  const failed = Boolean(err?.code) && err!.code !== "ok" && err!.code !== "none";
  if (failed) throw friendly(err!.code, err!.message, err!.log_id);
  if (json?.message && json.message !== "success" && !json.data) {
    throw friendly(String((json as any).code ?? json.message), json.message);
  }
  return json?.data ?? json ?? null;
}

export async function call<T = any>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    token?: string;
    form?: URLSearchParams;
    rawBody?: BodyInit;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const url = `${env.tiktokApiBase.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=UTF-8", ...init.headers };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;

  let body: BodyInit | undefined;
  if (init.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = init.form.toString();
  } else if (init.rawBody !== undefined) {
    body = init.rawBody;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
  }

  const res = await fetch(url, { method: init.method ?? "POST", headers, body, cache: "no-store" });
  return (await parse(res)) as T;
}

/** POST que cai para GET quando a rota responde 404/405 — os dois formatos aparecem na documentação. */
export async function callTryingGet<T = any>(path: string, body: Record<string, unknown>, token: string): Promise<T> {
  try {
    return await call<T>(path, { method: "POST", body, token });
  } catch (err) {
    if (err instanceof TikTokApiError && (err.status === 404 || err.status === 405)) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) params.set(k, String(v));
      return await call<T>(`${path}?${params.toString()}`, { method: "GET", token });
    }
    throw err;
  }
}
