"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Label } from "./parts";
import type { TikTokAccount } from "@/lib/types";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Cuiaba",
  "America/Fortaleza",
  "America/Recife",
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/New_York",
  "Europe/Lisbon",
  "UTC",
];

async function send(path: string, method: string, body: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falhou (${res.status})`);
  return json;
}

export function NewProfileForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [intervalMinutes, setInterval] = useState("360");
  const [dailyCap, setCap] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await send("/api/perfis", "POST", {
        username: username.trim() || null,
        interval_minutes: Number(intervalMinutes),
        daily_cap: Number(dailyCap),
        mode: "assisted",
      });
      setUsername("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end min-w-0">
      <div className="min-w-0">
        <Label>Apelido do perfil</Label>
        <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@minhaloja" />
      </div>
      <div className="min-w-0">
        <Label>Intervalo (min)</Label>
        <input className="field num" type="number" min={5} max={10080} step={5} value={intervalMinutes} onChange={(e) => setInterval(e.target.value)} />
      </div>
      <div className="min-w-0">
        <Label>Teto por dia</Label>
        <input className="field num" type="number" min={1} max={20} value={dailyCap} onChange={(e) => setCap(e.target.value)} />
      </div>
      <button className="btn btn-good justify-center" disabled={busy}>
        {busy ? "Criando…" : "Criar perfil"}
      </button>
      {error ? (
        <p className="text-sm text-bad col-span-full">{error}</p>
      ) : null}
    </form>
  );
}

export function ProfileEditor({ account, campaignId }: { account: TikTokAccount; campaignId: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    username: account.username ?? "",
    mode: account.mode,
    interval_minutes: account.interval_minutes,
    daily_cap: account.daily_cap,
    timezone: account.timezone,
    enabled: account.enabled,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    form.username !== (account.username ?? "") ||
    form.mode !== account.mode ||
    form.interval_minutes !== account.interval_minutes ||
    form.daily_cap !== account.daily_cap ||
    form.timezone !== account.timezone ||
    form.enabled !== account.enabled;

  async function save() {
    setBusy(true);
    try {
      await send("/api/perfis", "PATCH", { id: account.id, ...form });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end min-w-0">
      <div className="min-w-0">
        <Label>Apelido</Label>
        <input className="field" value={form.username} onChange={(e) => set("username", e.target.value)} />
      </div>
      <div className="min-w-0">
        <Label>Publicação</Label>
        <select className="field" value={form.mode} onChange={(e) => set("mode", e.target.value as TikTokAccount["mode"])}>
          <option value="assisted">assistida (sem risco)</option>
          <option value="api">API oficial (sozinha)</option>
        </select>
      </div>
      <div className="min-w-0">
        <Label>Intervalo (min)</Label>
        <input
          className="field num"
          type="number"
          min={5}
          max={10080}
          step={5}
          value={form.interval_minutes}
          onChange={(e) => set("interval_minutes", Number(e.target.value))}
        />
      </div>
      <div className="min-w-0">
        <Label>Teto por dia</Label>
        <input className="field num" type="number" min={1} max={20} value={form.daily_cap} onChange={(e) => set("daily_cap", Number(e.target.value))} />
      </div>
      <div className="min-w-0">
        <Label>Fuso</Label>
        <select className="field" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-2 min-w-0">
        <button
          type="button"
          className={`btn ${form.enabled ? "btn-good" : ""}`}
          onClick={() => set("enabled", !form.enabled)}
          title="Perfil habilitado entra na automação do cron"
        >
          {form.enabled ? "Habilitado" : "Desabilitado"}
        </button>
        <button className="btn" onClick={save} disabled={busy || !dirty}>
          {saved ? "Salvo ✓" : "Salvar"}
        </button>
      </div>
      {form.mode === "api" && !account.open_id ? (
        <p className="text-xs text-bad col-span-full">API oficial exige o perfil conectado ao TikTok acima.</p>
      ) : null}
      {campaignId ? null : <p className="text-xs text-mute col-span-full">A campanha com legenda e capa gerais é criada automaticamente no primeiro vídeo importado.</p>}
    </div>
  );
}

export function DeleteAccount({ accountId }: { accountId: string }) {
  const router = useRouter();
  return (
    <button
      className="btn btn-quiet"
      onClick={async () => {
        if (!confirm("Remover este perfil, a fila e os registros dele?")) return;
        await send("/api/perfis/apagar", "POST", { id: accountId });
        router.refresh();
      }}
    >
      Remover
    </button>
  );
}
