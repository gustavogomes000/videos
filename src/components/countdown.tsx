"use client";

import { useEffect, useState } from "react";

function human(ms: number) {
  const abs = Math.abs(ms);
  const sec = Math.floor(abs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  if (day >= 1) return `${day}d ${hour % 24}h`;
  if (hour >= 1) return `${hour}h ${String(min % 60).padStart(2, "0")}min`;
  if (min >= 1) return `${min}min ${String(sec % 60).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** Só o número muda de largura controlada: nada na tela pula quando atualiza. */
export function Countdown({ iso, pastLabel = "atrasado" }: { iso: string | null; pastLabel?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!iso) return <span className="num text-mute">—</span>;
  const diff = new Date(iso).getTime() - now;
  const past = diff < 0;
  return (
    <span className="num" style={{ color: past ? "var(--color-live)" : undefined }}>
      {past ? `${pastLabel} ${human(diff)}` : human(diff)}
    </span>
  );
}
