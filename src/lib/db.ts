import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let cached: SupabaseClient | null = null;

export class ConfigError extends Error {}

/**
 * Cliente com service_role: só roda no servidor, nunca vai para o navegador.
 * A anon key não enxerga nenhuma tabela, então todo acesso passa por aqui.
 */
export function db(): SupabaseClient {
  const url = env.supabaseUrl;
  const key = env.supabaseServiceKey;
  if (!url || !key) {
    throw new ConfigError(
      "Supabase não configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local e rode `npm run dev` de novo.",
    );
  }
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-application-name": "fila-tiktok" } },
    });
  }
  return cached;
}

export const TABLE = {
  accounts: "tiktok_accounts",
  campaigns: "campaigns",
  media: "media",
  log: "activity_log",
} as const;

/** Erro legível do Supabase, sem dump de JSON na tela. */
export function explainError(err: unknown): string {
  if (!err) return "erro desconhecido";
  if (err instanceof Error) return err.message;
  const anyErr = err as { message?: string; code?: string; details?: string; hint?: string };
  const base = anyErr.message ?? String(err);
  return anyErr.code ? `${base} (${anyErr.code})` : base;
}
