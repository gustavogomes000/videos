import Link from "next/link";
import { missingRequiredConfig, tiktokAppConfigured } from "@/lib/env";

/** Só aparece enquanto faltar configuração; some sozinho depois. */
export function SetupNotice() {
  const missing = missingRequiredConfig();
  const noApp = !tiktokAppConfigured();

  if (!missing.length && !noApp) return null;

  const items = missing.length
    ? [
        `Faltam estas variáveis em .env.local: ${missing.join(", ")}.`,
        "Rode a migration em supabase/migrations/0001_init.sql no SQL Editor do Supabase.",
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-5 pt-4">
      <div className="card p-4 border-live/50 bg-live/10">
        <div className="flex items-start gap-3 min-w-0">
          <span className="dot bg-live mt-1.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-bold">Antes de funcionar de verdade</p>
            <ul className="mt-2 space-y-1 text-sm text-mist/90">
              {items.map((t) => (
                <li key={t}>{t}</li>
              ))}
              {noApp ? (
                <li>
                  Sem app do TikTok configurado: dá para rodar tudo em <strong>modo assistido</strong>. Para publicação automática, preencha{" "}
                  <code>TIKTOK_CLIENT_KEY</code> e <code>TIKTOK_CLIENT_SECRET</code>.
                </li>
              ) : null}
            </ul>
            <Link href="/config" className="btn mt-3">
              Abrir o passo a passo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
