import type { ReactNode } from "react";
import { STATUS_LABEL, STATUS_TONE, type MediaStatus } from "@/lib/types";

const TONE_CLASS = {
  green: "tone-good",
  amber: "tone-live",
  blue: "tone-wait",
  red: "tone-bad",
  slate: "tone-off",
} as const;

const TONE_COLOR = {
  green: "var(--color-good)",
  amber: "var(--color-live)",
  blue: "var(--color-wait)",
  red: "var(--color-bad)",
  slate: "var(--color-off)",
} as const;

export type Tone = keyof typeof TONE_COLOR;

export function StatusPill({ status, pulse }: { status: MediaStatus; pulse?: boolean }) {
  const tone = STATUS_TONE[status];
  const live = pulse && (tone === "amber" || tone === "blue");
  return (
    <span className={`pill ${TONE_CLASS[tone]}`}>
      <span className={`dot ${live ? "pulse" : ""}`} style={{ background: TONE_COLOR[tone] }} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const map: Record<Tone, string> = { green: "tone-good", amber: "tone-live", blue: "tone-wait", red: "tone-bad", slate: "tone-off" };
  return <span className={`pill ${map[tone]}`}>{children}</span>;
}

/** Número primeiro, rótulo depois — os dígitos alinham em coluna. */
export function Stat({
  value,
  label,
  tone = "slate",
  title,
}: {
  value: ReactNode;
  label: string;
  tone?: Tone;
  title?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 min-w-0" title={title}>
      <span className="num text-2xl leading-none font-bold shrink-0" style={{ color: TONE_COLOR[tone] }}>
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-mute truncate-1">{label}</span>
    </div>
  );
}

export function ProgressRing({
  done,
  total,
  size = 76,
  tone = "green",
}: {
  done: number;
  total: number;
  size?: number;
  tone?: Tone;
}) {
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct * 100)}% concluído`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={TONE_COLOR[tone]}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 600ms ease" }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-mist)"
        fontSize={size * 0.28}
        fontWeight={700}
        className="num"
      >
        {Math.round(pct * 100)}
      </text>
    </svg>
  );
}

export function Bar({ segments }: { segments: { value: number; tone: Tone }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-panel-2">
      {segments.map((s, i) =>
        s.value > 0 ? (
          <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: TONE_COLOR[s.tone] }} title={`${s.value}`} />
        ) : null,
      )}
    </div>
  );
}

export function Section({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5 min-w-0">
      <header className="flex items-start justify-between gap-3 mb-4 min-w-0">
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wider text-mute truncate-1">{title}</h2>
          {hint ? <p className="text-xs text-mute mt-1">{hint}</p> : null}
        </div>
        {right ? <div className="flex items-center gap-2 shrink-0">{right}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-mute py-6 text-center">{children}</p>;
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="block text-[11px] uppercase tracking-wider text-mute mb-1.5">{children}</span>;
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const diff = now - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h atrás`;
  return `${Math.round(h / 24)} d atrás`;
}

export function formatDateTime(iso: string | null, tz = "America/Sao_Paulo"): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export function duration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m}min ${s}s` : `${s}s`;
}
