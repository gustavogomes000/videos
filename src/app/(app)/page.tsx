import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { AccountSwitch } from "@/components/item-actions";
import { Bar, Empty, ProgressRing, Section, Stat, StatusPill, formatDateTime, timeAgo } from "@/components/parts";
import { listByStatus, rollup, upcoming } from "@/lib/repo";
import { humanInterval } from "@/lib/scheduler";
import { ConfigError } from "@/lib/db";
import { missingRequiredConfig } from "@/lib/env";
import type { MediaItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const missing = missingRequiredConfig();
  if (missing.length) {
    return (
      <Section title="Configuração pendente" hint="A ferramenta só liga depois que o banco estiver de pé.">
        <p className="text-sm text-mute mb-3">Faltam: {missing.join(", ")}</p>
        <Link href="/config" className="btn btn-live">
          Abrir o passo a passo
        </Link>
      </Section>
    );
  }

  let accounts: Awaited<ReturnType<typeof rollup>> = [];
  try {
    accounts = await rollup();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
  }

  const suaVez = await listByStatus(["awaiting_manual"], 20);
  const proximo = accounts
    .map((a) => a.next_at)
    .filter((x): x is string => Boolean(x))
    .sort()[0] ?? null;

  const totals = accounts.reduce(
    (acc, a) => {
      acc.total += a.total;
      acc.published += a.published;
      acc.scheduled += a.scheduled;
      acc.working += a.working;
      acc.failed += a.failed;
      return acc;
    },
    { total: 0, published: 0, scheduled: 0, working: 0, failed: 0 },
  );

  if (!accounts.length) {
    return (
      <Section title="Comece pelo primeiro perfil" hint="Cada conta do TikTok vira um cartão com fila, ritmo e autonomia próprios.">
        <Empty>
          Nenhum perfil ainda. <Link href="/perfis" className="text-wait underline">Conectar um perfil do TikTok</Link> — ou criar o perfil em modo assistido, que funciona sem app aprovado.
        </Empty>
        <div className="flex justify-center">
          <Link href="/perfis" className="btn btn-good">
            Criar primeiro perfil
          </Link>
        </div>
      </Section>
    );
  }

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Kpi value={totals.total} label="vídeos na fila" tone="slate" />
        <Kpi value={totals.published} label="publicados" tone="green" />
        <Kpi value={totals.scheduled} label="agendados" tone="blue" />
        <Kpi value={suaVez.length} label="sua vez" tone="amber" />
        <Kpi value={totals.failed} label="com falha" tone="red" />
        <div className="card p-4 flex flex-col justify-center gap-1 min-w-0">
          <span className="text-[11px] uppercase tracking-wider text-mute truncate-1">próximo post em</span>
          <span className="text-xl font-bold truncate-1">
            <Countdown iso={proximo} pastLabel="atrasado em" />
          </span>
        </div>
      </div>

      {suaVez.length ? (
        <Section
          title="Sua vez de publicar"
          hint="Modo assistido: o pacote está pronto e o horário chegou. Abra, cole a legenda, toque em Publicar e marque aqui."
        >
          <ul className="flex flex-col gap-2">
            {suaVez.map((m) => (
              <ManualRow key={m.id} item={m} />
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <ProfileCard key={a.account_id} account={a} />
        ))}
      </div>
    </div>
  );
}

function Kpi({ value, label, tone }: { value: number; label: string; tone: "slate" | "green" | "blue" | "amber" | "red" }) {
  return (
    <div className="card p-4 min-w-0">
      <Stat value={value} label={label} tone={tone} />
    </div>
  );
}

function ManualRow({ item }: { item: MediaItem }) {
  return (
    <li className="flex flex-wrap items-center gap-3 row-line py-3 min-w-0">
      <span className="num text-lg font-bold text-live w-[52px] shrink-0">
        {String(Math.round(item.position)).padStart(3, "0")}
      </span>
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="text-sm font-semibold truncate-1">{item.original_title || item.filename || item.source_url || "vídeo"}</p>
        <p className="text-xs text-mute mt-0.5">
          Agendado {formatDateTime(item.scheduled_at)} · {item.storage_path ? "arquivo pronto" : "sem arquivo"}
        </p>
      </div>
      <StatusPill status={item.status} pulse />
      <div className="flex items-center gap-2 shrink-0">
        {item.source_url ? (
          <a className="btn" href={item.source_url} target="_blank" rel="noreferrer">
            Ver original
          </a>
        ) : null}
        <Link className="btn btn-live" href={`/fila#${item.id}`}>
          Abrir pacote
        </Link>
      </div>
    </li>
  );
}

async function ProfileCard({ account }: { account: Awaited<ReturnType<typeof rollup>>[number] }) {
  const nextItems = await upcoming(account.account_id, 3);
  const pct = account.total ? Math.round((account.published / account.total) * 100) : 0;

  return (
    <article className="card p-4 flex flex-col gap-4 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <ProgressRing
          done={account.published}
          total={account.total}
          tone={account.failed ? "red" : account.running ? "green" : "slate"}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate-1">@{account.username || "sem nome"}</p>
          <p className="text-xs text-mute mt-0.5 truncate-1">
            {account.mode === "api" ? "API oficial" : "assistido"} · {humanInterval(account.interval_minutes)} · {account.daily_cap}/dia
          </p>
          <p className="text-xs mt-1.5 truncate-1">
            <span className="text-mute">próximo em </span>
            <Countdown iso={account.next_at} pastLabel="atrasado em" />
          </p>
        </div>
      </div>

      <Bar
        segments={[
          { value: account.published, tone: "green" },
          { value: account.scheduled, tone: "blue" },
          { value: account.working, tone: "amber" },
          { value: account.failed, tone: "red" },
        ]}
      />

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat value={account.published} label={`de ${account.total} (${pct}%)`} tone="green" />
        <Stat value={account.scheduled} label="na agenda" tone="blue" />
        <Stat value={account.working} label="em processo" tone="amber" />
        <Stat value={account.failed} label="falhas" tone="red" />
      </div>

      {nextItems.length ? (
        <ul className="flex flex-col gap-1 text-xs text-mute">
          {nextItems.map((i) => (
            <li key={i.id} className="truncate-1">
              <span className="num">{String(Math.round(i.position)).padStart(3, "0")}</span> · {formatDateTime(i.scheduled_at, account.timezone)} ·{" "}
              {i.original_title?.slice(0, 40) ||
                i.source_url?.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40) ||
                `vídeo ${String(Math.round(i.position)).padStart(3, "0")}`}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-between gap-2 mt-auto min-w-0">
        <span className="text-[11px] text-mute truncate-1">postou {timeAgo(account.last_post_at)}</span>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/fila?perfil=${account.account_id}`} className="btn">
            Fila
          </Link>
          <AccountSwitch accountId={account.account_id} running={account.running} disabled={!account.enabled} />
        </div>
      </div>
    </article>
  );
}
