"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Label, Pill } from "./parts";
import type { Campaign } from "@/lib/types";

async function send(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falhou (${res.status})`);
  return json;
}

/**
 * Legenda geral + capa geral: valem para toda a campanha.
 * Legenda individual existe, mas só sobrescreve quando você preencher.
 */
export function CampaignPanel({ campaign, coverUrl }: { campaign: Campaign; coverUrl: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: campaign.name,
    general_caption: campaign.general_caption,
    general_hashtags: campaign.general_hashtags,
    privacy_level: campaign.privacy_level,
    disable_comment: campaign.disable_comment,
    disable_duet: campaign.disable_duet,
    disable_stitch: campaign.disable_stitch,
    brand_organic: campaign.brand_organic,
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dirty =
    form.name !== campaign.name ||
    form.general_caption !== campaign.general_caption ||
    form.general_hashtags !== campaign.general_hashtags ||
    form.privacy_level !== campaign.privacy_level ||
    form.disable_comment !== campaign.disable_comment ||
    form.disable_duet !== campaign.disable_duet ||
    form.disable_stitch !== campaign.disable_stitch ||
    form.brand_organic !== campaign.brand_organic;

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setNote(null);
  }

  async function save() {
    setBusy(true);
    try {
      await send("/api/campanha", "PATCH", { id: campaign.id, ...form });
      setNote("Salvo.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const preview = [form.general_caption.trim(), form.general_hashtags.trim()].filter(Boolean).join(" ");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] min-w-0">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="grid gap-3 sm:grid-cols-2 min-w-0">
          <div className="min-w-0">
            <Label>Nome da campanha</Label>
            <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="min-w-0">
            <Label>Privacidade</Label>
            <select className="field" value={form.privacy_level} onChange={(e) => set("privacy_level", e.target.value)}>
              <option value="PUBLIC_TO_EVERYONE">Público para todos</option>
              <option value="MUTUAL_FOLLOW_FRIENDS">Amigos mútuos</option>
              <option value="FOLLOWER_OF_CREATOR">Só seguidores</option>
              <option value="SELF_ONLY">Só eu</option>
            </select>
          </div>
        </div>

        <div className="min-w-0">
          <Label>Legenda geral (todas as postagens)</Label>
          <textarea className="field" rows={3} value={form.general_caption} onChange={(e) => set("general_caption", e.target.value)} placeholder="Ex: mais um do nosso catálogo" />
        </div>

        <div className="min-w-0">
          <Label>Hashtags gerais</Label>
          <input className="field" value={form.general_hashtags} onChange={(e) => set("general_hashtags", e.target.value)} placeholder="#movelplanejado #srsmoveis" />
        </div>

        <div className="flex flex-wrap gap-2 min-w-0">
          <Toggle label="Comentários" value={form.disable_comment} onChange={(v) => set("disable_comment", v)} />
          <Toggle label="Duetos" value={form.disable_duet} onChange={(v) => set("disable_duet", v)} />
          <Toggle label="Costuras" value={form.disable_stitch} onChange={(v) => set("disable_stitch", v)} />
          <Toggle label="Marca orgânica" value={form.brand_organic} onChange={(v) => set("brand_organic", v)} />
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <button className="btn btn-good" onClick={save} disabled={busy || !dirty}>
            {busy ? "Salvando…" : "Salvar campanha"}
          </button>
          {note ? <span className="text-xs text-mute truncate-1">{note}</span> : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 min-w-0">
        <Label>Capa geral</Label>
        <div className="aspect-video rounded-xl overflow-hidden bg-ink-2 border border-line flex items-center justify-center">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="Capa geral" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-mute">sem capa — o TikTok usa o primeiro frame</span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 4 * 1024 * 1024) {
              setNote("Capa acima de 4 MB. Use uma imagem menor.");
              return;
            }
            const data = new FormData();
            data.append("file", file);
            data.append("campaign_id", campaign.id);
            setBusy(true);
            const res = await fetch("/api/campanha/capa", { method: "POST", body: data });
            const json = await res.json().catch(() => ({}));
            setBusy(false);
            setNote(res.ok ? "Capa atualizada." : (json?.error ?? "Falha na capa."));
            e.target.value = "";
            router.refresh();
          }}
        />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          Escolher capa
        </button>
        <div className="text-xs text-mute min-w-0">
          <Label>Prévia da legenda</Label>
          <p className="break-words">{preview || "—"}</p>
          <p className="mt-1 num">{preview.length}/2200</p>
        </div>
        {campaign.started_at ? <Pill tone="green">iniciada</Pill> : <Pill tone="slate">não iniciada</Pill>}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`btn ${value ? "btn-bad" : ""}`} onClick={() => onChange(!value)}>
      <span className={`dot ${value ? "bg-bad" : "bg-good"}`} aria-hidden />
      {value ? `sem ${label.toLowerCase()}` : label}
    </button>
  );
}
