import Link from "next/link";
import { AppChrome } from "@/components/chrome";
import { explainError, ConfigError } from "@/lib/db";
import { listAccounts } from "@/lib/repo";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();

  // Uma única sondagem: sem banco respondendo nenhuma tela de fila faz sentido,
  // então mostramos o diagnóstico no lugar delas em vez de uma página em branco.
  let accounts: Awaited<ReturnType<typeof listAccounts>> | null = null;
  let dbProblem: string | null = null;
  try {
    accounts = await listAccounts();
  } catch (err) {
    dbProblem = err instanceof ConfigError ? "Banco ainda não configurado." : explainError(err);
  }

  return (
    <AppChrome accounts={accounts}>
      {dbProblem ? (
        <div className="card p-5 flex flex-col gap-3 max-w-2xl">
          <p className="text-base font-bold">O banco ainda não respondeu</p>
          <p className="text-sm text-mute break-words">{dbProblem}</p>
          <p className="text-sm text-mist/85">
            É o esperado antes de rodar a migration. Abra o passo a passo e cole o SQL no Supabase.
          </p>
          <div>
            <Link href="/config" className="btn btn-live">
              Abrir Config
            </Link>
          </div>
        </div>
      ) : (
        children
      )}
    </AppChrome>
  );
}
