import { scheduledTimestamps, updateMedia } from "./repo";
import type { MediaItem, TikTokAccount } from "./types";

const MINUTE = 60_000;

function partsFormatter(tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function zonedParts(date: Date, tz: string) {
  const raw = partsFormatter(tz).formatToParts(date);
  const pick = (t: string) => Number(raw.find((p) => p.type === t)?.value ?? 0);
  return { y: pick("year"), mo: pick("month") - 1, d: pick("day"), h: pick("hour") % 24, mi: pick("minute"), s: pick("second") };
}

/** Deslocamento do fuso (DST incluída) em ms. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  return Date.UTC(p.y, p.mo, p.d, p.h, p.mi, p.s) - date.getTime();
}

/** Instante real de um horário wall-clock no fuso do perfil. */
export function fromZoned(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, mo, d, h, mi));
  const off = tzOffsetMs(guess, tz);
  const exact = new Date(guess.getTime() - off);
  const off2 = tzOffsetMs(exact, tz);
  return off2 === off ? exact : new Date(guess.getTime() - off2);
}

export function localDayKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.y}-${String(p.mo + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function nextLocalMidnight(date: Date, tz: string): Date {
  const p = zonedParts(date, tz);
  return fromZoned(p.y, p.mo, p.d, 0, 0, tz).getTime() <= date.getTime()
    ? fromZoned(p.y, p.mo, p.d + 1, 0, 0, tz)
    : fromZoned(p.y, p.mo, p.d, 0, 0, tz);
}

export interface PlanResult {
  assigned: { id: string; scheduled_at: string; day: string }[];
  firstAt: string | null;
  lastAt: string | null;
  daysSpanned: number;
}

/**
 * Monta a agenda respeitando duas regras que você definiu por perfil:
 * o intervalo entre postagens e o teto de posts por dia local.
 * A ordem é sempre a da fila — nada pula na frente.
 */
export async function planSchedule(
  account: TikTokAccount,
  items: MediaItem[],
  options: { startFrom?: Date; respectLastPost?: boolean } = {},
): Promise<PlanResult> {
  const tz = account.timezone;
  const step = Math.max(5, account.interval_minutes) * MINUTE;
  const cap = Math.max(1, account.daily_cap);

  const now = new Date();
  let cursor = options.startFrom ? new Date(options.startFrom) : new Date(now.getTime() + 2 * MINUTE);
  if (options.respectLastPost !== false && account.last_post_at) {
    const earliest = new Date(new Date(account.last_post_at).getTime() + step);
    if (earliest > cursor) cursor = earliest;
  }
  if (cursor < now) cursor = new Date(now.getTime() + 2 * MINUTE);

  const taken = await scheduledTimestamps(account.id);

  // A fila já tem vagas marcadas à frente: o próximo entra depois da última.
  // Sem isso, dois vídeos que ficam prontos em minutos diferentes ganham o
  // mesmo horário e o intervalo que você escolheu não vale nada.
  const latestTaken = taken.reduce((acc, iso) => Math.max(acc, new Date(iso).getTime()), 0);
  if (latestTaken && latestTaken + step > cursor.getTime()) cursor = new Date(latestTaken + step);

  const perDay = new Map<string, number>();
  for (const iso of taken) {
    const key = localDayKey(new Date(iso), tz);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  // Replanejar abre espaço: desconta o que está na lista que vamos reescrever.
  for (const item of items) {
    if (!item.scheduled_at) continue;
    const key = localDayKey(new Date(item.scheduled_at), tz);
    const n = (perDay.get(key) ?? 0) - 1;
    if (n <= 0) perDay.delete(key);
    else perDay.set(key, n);
  }

  const ordered = [...items].sort((a, b) => Number(a.position) - Number(b.position));
  const assigned: PlanResult["assigned"] = [];

  for (const item of ordered) {
    let slot = cursor;
    // Só pode entrar num dia que ainda tenha vaga no teto diário.
    for (let guard = 0; guard < 400; guard++) {
      const key = localDayKey(slot, tz);
      if ((perDay.get(key) ?? 0) < cap) break;
      slot = new Date(nextLocalMidnight(slot, tz).getTime() + MINUTE);
    }
    const key = localDayKey(slot, tz);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);

    const iso = slot.toISOString();
    assigned.push({ id: item.id, scheduled_at: iso, day: key });
    await updateMedia(item.id, { scheduled_at: iso, status: item.status === "published" ? "published" : "ready" });
    cursor = new Date(slot.getTime() + step);
  }

  const days = new Set(assigned.map((a) => a.day));
  return {
    assigned,
    firstAt: assigned[0]?.scheduled_at ?? null,
    lastAt: assigned.at(-1)?.scheduled_at ?? null,
    daysSpanned: days.size,
  };
}

export function humanInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}
