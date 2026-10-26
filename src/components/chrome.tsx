import Link from "next/link";
import { Nav } from "@/components/nav";
import { RunNow, SignOutButton, WorkerToggle } from "@/components/run-controls";
import { SetupNotice } from "@/components/setup-notice";
import type { TikTokAccount } from "@/lib/types";

/**
 * Casca igual para os dois grupos de rotas: o `(app)` só existe para trocar o
 * conteúdo pelo diagnóstico quando o banco não responde; `(setup)` (Config)
 * precisa abrir mesmo com o banco vazio, porque é ela que diz o que fazer.
 */
export function AppChrome({
  accounts,
  children,
}: {
  accounts: TikTokAccount[] | null;
  children: React.ReactNode;
}) {
  const running = (accounts ?? []).some((a) => a.enabled && a.running);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-ink/95 backdrop-blur border-b border-line">
        <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-5 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-good shrink-0" aria-hidden />
              <span className="text-base font-extrabold tracking-tight truncate-1">Fila TikTok</span>
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              {accounts?.length ? <WorkerToggle running={running} /> : null}
              {accounts ? <RunNow /> : null}
              <SignOutButton />
            </div>
          </div>
          <Nav running={running} />
        </div>
      </header>

      <SetupNotice />

      <main className="mx-auto w-full max-w-[1400px] px-3 sm:px-5 py-5 flex-1 min-w-0">{children}</main>

      <footer className="mx-auto w-full max-w-[1400px] px-3 sm:px-5 py-6 text-xs text-mute">
        Ordem preservada · ritmo por perfil · tokens guardados cifrados no Supabase
      </footer>
    </div>
  );
}
