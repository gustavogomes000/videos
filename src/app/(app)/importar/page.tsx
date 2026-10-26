import Link from "next/link";
import { CampaignPanel } from "@/components/campaign-panel";
import { ImportFiles, ImportOfficial, ImportUrls } from "@/components/import-tools";
import { Empty, Label, Section, Stat } from "@/components/parts";
import { ProfilePicker } from "@/components/profile-picker";
import { signedUrl } from "@/lib/media";
import { getActiveCampaign, listAccounts, listMedia } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function ImportarPage({ searchParams }: { searchParams: Promise<{ perfil?: string }> }) {
  const params = await searchParams;
  const accounts = await listAccounts();
  if (!accounts.length) {
    return (
      <Section title="Nenhum perfil">
        <Empty>Crie um perfil antes de importar vídeos.</Empty>
        <div className="flex justify-center">
          <Link href="/perfis" className="btn btn-good">
            Criar perfil
          </Link>
        </div>
      </Section>
    );
  }

  const account = accounts.find((a) => a.id === params.perfil) ?? accounts[0];
  const campaign = await getActiveCampaign(account.id);
  const items = await listMedia(campaign.id);
  const coverUrl = campaign.cover_path ? await signedUrl(campaign.cover_path, 3600) : null;

  const withFile = items.filter((i) => i.storage_path).length;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <ProfilePicker accounts={accounts.map((a) => ({ id: a.id, label: `@${a.username || a.id.slice(0, 6)}` }))} current={account.id} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <div className="card p-4">
          <Stat value={items.length} label="na fila" tone="slate" />
        </div>
        <div className="card p-4">
          <Stat value={withFile} label="com arquivo" tone="green" />
        </div>
        <div className="card p-4">
          <Stat value={items.length - withFile} label="sem arquivo" tone="red" />
        </div>
        <div className="card p-4 min-w-0">
          <Label>Perfil</Label>
          <p className="text-sm font-bold truncate-1">@{account.username || "sem nome"}</p>
          <p className="text-xs text-mute truncate-1">{account.mode === "api" ? "publica sozinho" : "modo assistido"}</p>
        </div>
      </div>

      <Section title="Legenda geral e capa geral" hint="Vale para toda a fila. A legenda individual, se existir, substitui a geral naquele vídeo.">
        <CampaignPanel campaign={campaign} coverUrl={coverUrl} />
      </Section>

      <Section title="Importar" hint="A ordem que você colar é a ordem que vai publicar. Linha 1 = vídeo 001.">
        <div className="grid gap-6 lg:grid-cols-2 min-w-0">
          <ImportUrls accountId={account.id} />
          <div className="flex flex-col gap-6 min-w-0">
            <ImportOfficial accountId={account.id} connected={Boolean(account.open_id)} />
            <ImportFiles accountId={account.id} />
          </div>
        </div>
      </Section>

      <Section title="Próximo passo" hint="Depois de importar, a agenda é montada sozinha pelo cron. Você pode conferir e ajustar aqui.">
        <Link href={`/fila?perfil=${account.id}`} className="btn btn-good">
          Abrir a fila de @{account.username || "perfil"}
        </Link>
      </Section>
    </div>
  );
}
