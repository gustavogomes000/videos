import Link from "next/link";
import { Empty, Section, Stat, Pill } from "@/components/parts";
import { ProfilePicker } from "@/components/profile-picker";
import { QueueBoard } from "@/components/queue-board";
import { getActiveCampaign, listAccounts, listMedia } from "@/lib/repo";
import { humanInterval } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export default async function FilaPage({ searchParams }: { searchParams: Promise<{ perfil?: string }> }) {
  const params = await searchParams;
  const accounts = await listAccounts();
  if (!accounts.length) {
    return (
      <Section title="Sem fila">
        <Empty>
          Nenhum perfil. <Link href="/perfis" className="text-wait underline">Criar o primeiro</Link>.
        </Empty>
      </Section>
    );
  }

  const account = accounts.find((a) => a.id === params.perfil) ?? accounts[0];
  const campaign = await getActiveCampaign(account.id);
  const items = await listMedia(campaign.id);

  const published = items.filter((i) => i.status === "published").length;
  const waiting = items.filter((i) => i.status === "awaiting_manual").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const lastScheduled = [...items].reverse().find((i) => i.scheduled_at)?.scheduled_at ?? null;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <ProfilePicker accounts={accounts.map((a) => ({ id: a.id, label: `@${a.username || a.id.slice(0, 6)}` }))} current={account.id} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        <div className="card p-4">
          <Stat value={items.length} label="vídeos" tone="slate" />
        </div>
        <div className="card p-4">
          <Stat value={published} label="publicados" tone="green" />
        </div>
        <div className="card p-4">
          <Stat value={waiting} label="sua vez" tone="amber" />
        </div>
        <div className="card p-4">
          <Stat value={failed} label="falhas" tone="red" />
        </div>
        <div className="card p-4 min-w-0">
          <Stat value={humanInterval(account.interval_minutes)} label="entre posts" tone="blue" title={`Teto de ${account.daily_cap} por dia, fuso ${account.timezone}`} />
        </div>
      </div>

      <Section
        title={`Fila de @${account.username || "sem nome"}`}
        hint={`Campanha “${campaign.name}” · termina em ${lastScheduled ? new Date(lastScheduled).toLocaleDateString("pt-BR") : "—"} · ${account.mode === "api" ? "publica sozinho" : "modo assistido"}`}
        right={
          <>
            <Link href={`/importar?perfil=${account.id}`} className="btn">
              Importar
            </Link>
            {account.running ? <Pill tone="green">rodando</Pill> : <Pill tone="slate">parado</Pill>}
          </>
        }
      >
        <QueueBoard account={account} items={items} />
      </Section>
    </div>
  );
}
