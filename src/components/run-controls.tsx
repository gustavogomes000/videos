"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falhou (${res.status})`);
  return json;
}

export function RunNow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const res = await post("/api/fila/rodar");
      const steps: { action: string }[] = res?.steps ?? [];
      setNote(steps.length ? `${steps.length} passo(s): ${[...new Set(steps.map((s) => s.action))].join(", ")}` : "Nada pendente agora.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Falhou");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button className="btn btn-quiet" onClick={run} disabled={busy} title="Executa a próxima etapa imediatamente, sem esperar o cron">
        {busy ? "Rodando…" : "Rodar agora"}
      </button>
      {note ? <span className="text-xs text-mute truncate-1 hidden sm:inline">{note}</span> : null}
    </div>
  );
}

export function WorkerToggle({ running }: { running: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function flip() {
    setBusy(true);
    try {
      await post("/api/fila/ligar", { running: !running });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <button
      className={`btn ${running ? "btn-good" : ""}`}
      onClick={flip}
      disabled={busy}
      title="Ligado: o cron agenda e publica sozinho na ordem. Desligado: nada sobe."
    >
      <span className={`dot ${running ? "bg-good pulse" : "bg-off"}`} aria-hidden />
      {running ? "Automação ligada" : "Automação parada"}
    </button>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-quiet"
      onClick={async () => {
        await fetch("/api/sair", { method: "POST" });
        router.push("/entrar");
      }}
    >
      Sair
    </button>
  );
}
