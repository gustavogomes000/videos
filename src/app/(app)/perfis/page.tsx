import Link from "next/link";
import { DeleteAccount, NewProfileForm } from "@/components/profile-forms";
import { Empty, Section, Pill } from "@/components/parts";
import { findActiveCampaign, listAccounts } from "@/lib/repo";
import { humanInterval } from "@/lib/scheduler";
import { tokenSnapshot, authConfigured } from "@/lib/tiktok/oauth";
import { appBaseUrl } from "@/lib/env";
import type { TikTokAccount } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PerfisPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const params = await searchParams;
  const aviso = params.ok ? { tone: "green" as const, text: params.ok } : params.erro ? { tone: "red" as const, text: params.erro } : null;
  const accounts = await listAccounts();
  const rows = await Promise.all(
    accounts.map(async (a) => ({
      account: a,
      token: await tokenSnapshot(a.id).catch(() => null),
      campaign: await findActiveCampaign(a.id),
    })),
  );

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {aviso ? (
        <div className="card p-4 flex items-start gap-3 min-w-0">
          <Pill tone={aviso.tone}>{aviso.tone === "green" ? "conectado" : "deu errado"}</Pill>
          <p className="text-sm break-words min-w-0">{aviso.text}</p>
        </div>
      ) : null}

      <Section
        title="Novo perfil"
        hint="Crie o perfil primeiro. Conectar ao TikTok vem depois — sem conexão ele funciona em modo assistido."
      >
        <NewProfileForm />
      </Section>

      <Section title="Perfis" hint="Ritmo, teto diário e forma de publicar são por perfil. Um não interfere no outro.">
        {!rows.length ? <Empty>Nenhum perfil criado.</Empty> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map(({ account, token, campaign }) => (
            <ProfileRow key={account.id} account={account} connected={token?.connected ?? false} campaignId={campaign?.id ?? null} />
          ))}
        </div>
      </Section>

      <Section
        title="Perdeu o acesso a um perfil?"
        hint="Recuperar a conta é fluxo do próprio TikTok. Esta ferramenta não guarda nem adivinha senha — ela só usa a autorização oficial depois que você consegue entrar."
      >
        <ol className="text-sm text-mist/85 flex flex-col gap-2 list-decimal pl-5">
          <li>
            Abra <a className="underline" href="https://www.tiktok.com/login" target="_blank" rel="noreferrer">tiktok.com/login</a> e use <strong>Esqueceu a senha?</strong> com o e-mail ou celular da conta. É por aí que volta o acesso quando você ainda tem o contato.
          </li>
          <li>
            <strong>Entrar com o Google</strong> só funciona se aquela conta do TikTok foi criada ou ligada a uma conta Google. Teste em <em>Continuar com Google</em> na tela de login do TikTok; se ele diz que não há conta ligada, não há atalho — é recuperação por e-mail ou pelo formulário de suporte do TikTok.
          </li>
          <li>
            Conseguiu entrar? Crie o perfil aqui, clique em <strong>Conectar ao TikTok</strong> e autorize. A partir daí a fila enxerga os vídeos que ainda estão publicados na conta e puxa todos de volta, na ordem.
          </li>
          <li>
            Se a conta foi bloqueada ou desativada, o caminho é <a className="underline" href="https://www.tiktok.com/legal/report/feedback" target="_blank" rel="noreferrer">o formulário oficial de recurso</a>. Nenhum script resolve isso por fora, e tentar por fora é o que derruba as outras contas.
          </li>
        </ol>
      </Section>

      <Section title="Como a autorização funciona" hint={`Callback configurado no TikTok for Developers: ${appBaseUrl()}/api/tiktok/callback`}>
        <ol className="text-sm text-mist/85 flex flex-col gap-2 list-decimal pl-5">
          <li>
            Em <strong>Perfis</strong>, clique em <strong>Conectar ao TikTok</strong>. Você abre a tela oficial do TikTok, escolhe a conta e autoriza — sua senha nunca passa por aqui.
          </li>
          <li>
            O token fica cifrado (AES-256-GCM) na coluna <code>token_enc</code> e se renova sozinho: o de acesso dura 24h, o de renovação 365 dias.
          </li>
          <li>
            Publicar sozinho exige o app aprovado pelo TikTok (escopo <code>video.publish</code>). Enquanto a aprovação não chega, o perfil fica em modo
            assistido e a fila continua andando do mesmo jeito — você só toca em Publicar.
          </li>
          {!authConfigured() ? (
            <li>
              <Pill tone="amber">Falta configurar</Pill> Preencha <code>TIKTOK_CLIENT_KEY</code> e <code>TIKTOK_CLIENT_SECRET</code> na tela Config.
            </li>
          ) : null}
        </ol>
      </Section>
    </div>
  );
}

async function ProfileRow({
  account,
  connected,
  campaignId,
}: {
  account: TikTokAccount;
  connected: boolean;
  campaignId: string | null;
}) {
  const { ProfileEditor } = await import("@/components/profile-forms");
  return (
    <article className="card p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        {account.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-10 h-10 rounded-full bg-panel-2 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate-1">@{account.username || "sem nome"}</p>
          <p className="text-xs text-mute truncate-1">
            {humanInterval(account.interval_minutes)} entre posts · teto {account.daily_cap}/dia · {account.timezone}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {account.mode === "api" ? <Pill tone={connected ? "green" : "red"}>{connected ? "API pronta" : "API sem token"}</Pill> : <Pill tone="amber">assistido</Pill>}
        </div>
      </div>

      <ProfileEditor account={account} campaignId={campaignId} />

      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {connected ? (
          <a className="btn" href={`/api/tiktok/desconectar?id=${account.id}`}>
            Desconectar
          </a>
        ) : (
          <a className="btn btn-live" href={`/api/tiktok/conectar?id=${account.id}`}>
            Conectar ao TikTok
          </a>
        )}
        <Link className="btn" href={`/importar?perfil=${account.id}`}>
          Importar vídeos
        </Link>
        <Link className="btn" href={`/fila?perfil=${account.id}`}>
          Abrir fila
        </Link>
        <div className="ml-auto">
          <DeleteAccount accountId={account.id} />
        </div>
      </div>
    </article>
  );
}
