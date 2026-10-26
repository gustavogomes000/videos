import { Empty, Label, Section, Stat, timeAgo } from "@/components/parts";
import { listAccounts, recentLog, rollup } from "@/lib/repo";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  download: "baixou arquivo",
  schedule: "montou agenda",
  publish_init: "enviou ao TikTok",
  upload_init: "abriu upload em pedaços",
  upload_done: "upload completo",
  published: "publicou",
  manual_ready: "avisou que é sua vez",
  send_to_user: "TikTok devolveu rascunho",
  step_failed: "passo com erro",
  tick: "rodada do worker",
  token: "token",
  import: "importação",
  connect: "conexão",
};

export default async function RegistroPage() {
  const [rows, accounts, sums] = await Promise.all([recentLog(300), listAccounts(), rollup().catch(() => [])]);

  const errors = rows.filter((r) => r.level !== "info").length;
  const nameOf = (id: string | null) => accounts.find((a) => a.id === id)?.username ?? (id ? id.slice(0, 8) : "geral");

  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const day = new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }

  const totalPublished = sums.reduce((s, a) => s + a.published, 0);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <div className="card p-4">
          <Stat value={rows.length} label="eventos" tone="slate" />
        </div>
        <div className="card p-4">
          <Stat value={errors} label="avisos e erros" tone={errors ? "red" : "green"} />
        </div>
        <div className="card p-4">
          <Stat value={totalPublished} label="publicados no total" tone="green" />
        </div>
      </div>

      <Section title="Registro" hint="Cada passo do worker fica aqui — inclusive o que falhou e por quê.">
        {!rows.length ? <Empty>Nada registrado ainda. Ligue a automação ou clique em “Rodar agora”.</Empty> : null}

        {Array.from(byDay.entries()).map(([day, list]) => (
          <div key={day} className="mb-5 min-w-0">
            <Label>{day}</Label>
            <ul className="flex flex-col min-w-0">
              {list.map((r) => (
                <li key={r.id} className="row-line py-2 flex items-start gap-3 min-w-0">
                  <span
                    className="dot mt-1.5 shrink-0"
                    style={{ background: r.level === "error" ? "var(--color-bad)" : r.level === "warn" ? "var(--color-live)" : "var(--color-good)" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate-1">{r.message}</p>
                    <p className="text-[11px] text-mute truncate-1 mt-0.5">
                      {KIND_LABEL[r.kind] ?? r.kind} · @{nameOf(r.account_id)}
                    </p>
                  </div>
                  <span className="text-[11px] text-mute shrink-0 num">{timeAgo(r.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>
    </div>
  );
}
