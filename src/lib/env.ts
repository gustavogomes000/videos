function req(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export const env = {
  get supabaseUrl() {
    return req("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return req("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey() {
    return req("SUPABASE_SERVICE_ROLE_KEY");
  },
  get storageBucket() {
    return req("SUPABASE_STORAGE_BUCKET") ?? "tiktok-media";
  },

  get appPassword() {
    return req("APP_PASSWORD");
  },
  get encryptionKey() {
    return req("APP_ENCRYPTION_KEY");
  },
  get cronSecret() {
    return req("CRON_SECRET");
  },
  get publicUrl() {
    return req("NEXT_PUBLIC_APP_URL");
  },

  get tiktokClientKey() {
    return req("TIKTOK_CLIENT_KEY");
  },
  get tiktokClientSecret() {
    return req("TIKTOK_CLIENT_SECRET");
  },
  get tiktokApiBase() {
    return req("TIKTOK_API_BASE") ?? "https://open.tiktokapis.com";
  },
  get tiktokAuthBase() {
    return req("TIKTOK_AUTH_BASE") ?? "https://www.tiktok.com";
  },

  /** Worker: quanto tempo ele pode gastar num tick antes de devolver e esperar o próximo. */
  get tickBudgetMs() {
    return Number(req("TICK_BUDGET_MS") ?? 45_000);
  },
  get chunkSize() {
    // 5 MB é o tamanho que o TikTok pede no exemplo oficial.
    return Number(req("TIKTOK_CHUNK_SIZE") ?? 5 * 1024 * 1024);
  },
};

export type ConfigKey =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "APP_PASSWORD"
  | "APP_ENCRYPTION_KEY"
  | "CRON_SECRET";

export function missingRequiredConfig(): ConfigKey[] {
  const missing: ConfigKey[] = [];
  if (!env.supabaseUrl || !env.supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.supabaseServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!env.appPassword) missing.push("APP_PASSWORD");
  if (!env.encryptionKey) missing.push("APP_ENCRYPTION_KEY");
  if (!env.cronSecret) missing.push("CRON_SECRET");
  return missing;
}

export function tiktokAppConfigured(): boolean {
  return Boolean(env.tiktokClientKey && env.tiktokClientSecret);
}

export function appBaseUrl(): string {
  if (env.publicUrl) return env.publicUrl.replace(/\/$/, "");
  const onVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (onVercel) return `https://${onVercel}`;
  return "http://localhost:3000";
}
