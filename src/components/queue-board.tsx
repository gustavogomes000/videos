"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Countdown } from "./countdown";
import { Label, StatusPill } from "./parts";
import { formatDateTime } from "./parts";
import type { MediaItem, TikTokAccount } from "@/lib/types";

interface PackageData {
  video_url: string | null;
  caption: string;
  original_url: string | null;
  filename: string | null;
  cover_url: string | null;
}

async function send(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falhou (${res.status})`);
  return json;
}

export function QueueBoard({ account, items }: { account: TikTokAccount; items: MediaItem[] }) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [openPackage, setOpenPackage] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      router.refresh();
    }
  }

  function drop(targetId: string | null) {
    const source = dragId;
    setDragId(null);
    setOverId(null);
    if (!source || source === targetId) return;
    void act(() => send("/api/fila/reordenar", { id: source, before_id: targetId }));
  }

  if (!items.length) {
    return <p className="text-sm text-mute py-6 text-center">Fila vazia. Importe os links em Importar.</p>;
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <PlanButton accountId={account.id} />
        <span className="text-xs text-mute truncate-1">Arraste qualquer linha para corrigir a ordem. A posição é salva na hora.</span>
      </div>
      {error ? <p className="text-sm text-bad">{error}</p> : null}

      <ul className="flex flex-col min-w-0">
        {items.map((item) => {
          const number = String(Math.round(item.position)).padStart(3, "0");
          const needsYou = item.status === "awaiting_manual";
          return (
            <li
              key={item.id}
              id={item.id}
              draggable
              onDragStart={() => setDragId(item.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverId(item.id);
              }}
              onDragLeave={() => setOverId((o) => (o === item.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(item.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={[
                "row-line py-3 flex flex-col gap-2 min-w-0 cursor-grab",
                dragId === item.id ? "dragging" : "",
                overId === item.id && dragId !== item.id ? "drop-before" : "",
                needsYou ? "bg-live/5" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="num text-lg font-bold w-[46px] shrink-0 text-mute">{number}</span>
                <div className="min-w-0 flex-1 basis-[200px]">
                  <p className="text-sm font-semibold truncate-1">{item.original_title || item.source_url?.replace(/^https?:\/\/(www\.)?/, "") || `vídeo ${number}`}</p>
                  <p className="text-xs text-mute mt-0.5 truncate-1">
                    {item.duration_sec ? `${item.duration_sec}s · ` : ""}
                    {item.size_bytes ? `${(item.size_bytes / 1e6).toFixed(1)} MB · ` : "sem arquivo · "}
                    {item.source_kind === "url" ? "por link" : item.source_kind === "official" ? "API oficial" : "enviado por você"}
                    {item.attempts > 1 ? ` · ${item.attempts} tentativas` : ""}
                  </p>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-[150px]">
                  <StatusPill status={item.status} pulse={needsYou} />
                  {item.scheduled_at ? (
                    <span className="text-[11px] text-mute num truncate-1">
                      {formatDateTime(item.scheduled_at, account.timezone)} ·{" "}
                      <Countdown iso={item.scheduled_at} pastLabel="atrasado em" />
                    </span>
                  ) : (
                    <span className="text-[11px] text-mute">sem horário</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pl-[46px] min-w-0">
                <span className="sm:hidden">
                  <StatusPill status={item.status} pulse={needsYou} />
                </span>

                <button
                  className="btn"
                  onClick={() => setOpenPackage((o) => (o === item.id ? null : item.id))}
                  title="Link do arquivo, legenda pronta e o original"
                >
                  Pacote
                </button>

                {needsYou ? (
                  <>
                    <button className="btn btn-good" onClick={() => act(() => send("/api/fila/confirmei", { id: item.id }))}>
                      Já publiquei ✓
                    </button>
                    <button className="btn" onClick={() => act(() => send("/api/fila/adiar", { id: item.id, minutes: 60 }))}>
                      +1h
                    </button>
                  </>
                ) : null}

                {item.status === "failed" ? (
                  <button className="btn btn-live" onClick={() => act(() => send("/api/fila/tentar-de-novo", { id: item.id }))}>
                    Tentar de novo
                  </button>
                ) : null}

                {item.status === "awaiting_upload" ? (
                  <span className="text-xs text-bad truncate-1">envie o arquivo em Importar, ou troque o link</span>
                ) : null}

                {["ready", "queued", "awaiting_manual"].includes(item.status) ? (
                  <button className="btn btn-quiet" onClick={() => act(() => send("/api/fila/pular", { id: item.id }))}>
                    Pular
                  </button>
                ) : null}

                <button className="btn btn-quiet" onClick={() => setEditId((e) => (e === item.id ? null : item.id))}>
                  Legenda deste vídeo
                </button>

                <button
                  className="btn btn-quiet ml-auto"
                  onClick={() => {
                    if (!confirm("Tirar este vídeo da fila?")) return;
                    void act(() => send("/api/fila/remover", { id: item.id }));
                  }}
                >
                  Remover
                </button>
              </div>

              {item.error ? <p className="text-xs text-bad pl-[46px] break-words">{item.error}</p> : null}

              {openPackage === item.id ? <Package mediaId={item.id} /> : null}
              {editId === item.id ? <CaptionEditor item={item} onDone={() => setEditId(null)} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlanButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await send("/api/fila/planejar", { account_id: accountId });
            setMsg(`${res.assigned} agendados · primeiro ${formatDateTime(res.firstAt)} · ${res.days} dia(s)`);
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Erro");
          } finally {
            setBusy(false);
            router.refresh();
          }
        }}
      >
        {busy ? "Montando…" : "Montar agenda"}
      </button>
      {msg ? <span className="text-xs text-mute truncate-1">{msg}</span> : null}
    </div>
  );
}

function Package({ mediaId }: { mediaId: string }) {
  const [data, setData] = useState<PackageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/fila/pacote?id=${mediaId}`);
        const json = (await res.json()) as PackageData & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Falhou.");
        if (alive) setData(json);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Erro");
      }
    })();
    return () => {
      alive = false;
    };
  }, [mediaId]);

  if (error) return <p className="text-xs text-bad pl-[46px]">{error}</p>;
  if (!data) return <p className="text-xs text-mute pl-[46px]">abrindo o pacote…</p>;

  return (
    <div className="pl-[46px] flex flex-col gap-2 min-w-0">
      <div className="flex flex-wrap gap-2 min-w-0">
        {data.video_url ? (
          <>
            <a className="btn" href={data.video_url} target="_blank" rel="noreferrer">
              Assistir
            </a>
            <a className="btn" href={data.video_url} download={data.filename ?? true}>
              Baixar arquivo
            </a>
          </>
        ) : (
          <span className="text-xs text-bad">sem arquivo guardado</span>
        )}
        {data.original_url ? (
          <a className="btn" href={data.original_url} target="_blank" rel="noreferrer">
            Ver original
          </a>
        ) : null}
        <button
          className="btn btn-live"
          onClick={async () => {
            await navigator.clipboard.writeText(data.caption);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copiou ✓" : "Copiar legenda"}
        </button>
        <a className="btn" href="https://www.tiktok.com/upload" target="_blank" rel="noreferrer">
          Abrir o TikTok
        </a>
      </div>
      <p className="text-xs text-mist/80 break-words bg-ink-2 rounded-xl p-3 whitespace-pre-wrap">{data.caption || "— sem legenda —"}</p>
      {data.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.cover_url} alt="Capa" className="w-[160px] rounded-lg border border-line" />
      ) : null}
    </div>
  );
}

function CaptionEditor({ item, onDone }: { item: MediaItem; onDone: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(item.caption ?? "");

  return (
    <div className="pl-[46px] flex flex-col gap-2 min-w-0">
      <Label>Legenda só deste vídeo (deixe vazio para usar a geral)</Label>
      <textarea className="field" rows={2} value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="flex gap-2 min-w-0">
        <button
          className="btn btn-good"
          onClick={async () => {
            await send("/api/fila/legenda", { id: item.id, caption: value });
            onDone();
            router.refresh();
          }}
        >
          Salvar legenda
        </button>
        <button className="btn btn-quiet" onClick={onDone}>
          Fechar
        </button>
      </div>
    </div>
  );
}
