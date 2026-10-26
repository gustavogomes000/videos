"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Label, Pill } from "./parts";

function parseLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of text.split(/[\n\r,; ]+/)) {
    const line = chunk.trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

export function ImportUrls({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ added: number; rejected: string[] } | null>(null);

  const lines = useMemo(() => parseLines(text), [text]);

  async function add() {
    setBusy(true);
    setReport(null);
    try {
      const res = await fetch("/api/importar/urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, urls: lines }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falhou.");
      setReport({ added: json.added, rejected: json.rejected ?? [] });
      if (json.added) setText("");
    } catch (err) {
      setReport({ added: 0, rejected: [err instanceof Error ? err.message : "Erro"] });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <Label>Links na ordem exata em que devem ser publicados</Label>
      <textarea
        className="field"
        rows={8}
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"https://www.tiktok.com/@perfil/video/7300000000000000000\nhttps://vm.tiktok.com/ZMabcdef/\nhttps://www.tiktok.com/@perfil/video/7300000000000000001"}
      />
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <button className="btn btn-good" onClick={add} disabled={busy || !lines.length}>
          {busy ? "Adicionando…" : `Adicionar ${lines.length || ""} em ordem`}
        </button>
        <span className="text-xs text-mute truncate-1">Duplicados caem sozinhos. Nada é reordenado depois: a posição é fixa.</span>
        {report ? (
          <span className="flex items-center gap-2">
            <Pill tone={report.added ? "green" : "red"}>{report.added ? `${report.added} adicionados` : "nenhum"}</Pill>
            {report.rejected.length ? (
              <Pill tone="amber" >{report.rejected.length} recusados: {report.rejected.slice(0, 2).join(" · ")}</Pill>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ImportOfficial({ accountId, connected }: { accountId: string; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function pull() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/importar/oficial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      });
      const json = await res.json();
      setMsg(res.ok ? `${json.added} vídeo(s) importados do perfil, do mais antigo ao mais novo${json.skipped ? ` (${json.skipped} sem endereço de download)` : ""}.` : (json?.error ?? "Falhou."));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <Label>Puxar do próprio perfil (API oficial)</Label>
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <button className="btn" onClick={pull} disabled={busy || !connected}>
          {busy ? "Consultando…" : "Listar meus vídeos"}
        </button>
        {!connected ? <Pill tone="red">precisa conectar o perfil</Pill> : null}
      </div>
      {msg ? <p className="text-xs text-mute break-words">{msg}</p> : null}
    </div>
  );
}

interface UploadingRow {
  name: string;
  size: number;
  state: "esperando" | "enviando" | "pronto" | "falhou";
  detail?: string;
}

export function ImportFiles({ accountId }: { accountId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UploadingRow[]>([]);

  async function sendOne(file: File) {
    const res = await fetch("/api/importar/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, filename: file.name, mime: file.type || "video/mp4", size: file.size }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Não consegui abrir o upload.");

    // O navegador fala direto com o Storage; o arquivo não passa pelo corpo
    // da função do Vercel, que tem teto de 4,5 MB.
    const up = await fetch(json.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "video/mp4" },
      body: file,
    });
    if (!up.ok) throw new Error(`O Storage recusou o arquivo (${up.status}).`);

    const done = await fetch("/api/importar/arquivo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: json.media_id, size: file.size, mime: file.type || "video/mp4" }),
    });
    const doneJson = await done.json().catch(() => ({}));
    if (!done.ok) throw new Error(doneJson?.error ?? "Falha ao registrar o arquivo.");
  }

  async function handle(files: FileList) {
    const list = Array.from(files);
    setRows(list.map((f) => ({ name: f.name, size: f.size, state: "esperando" as const })));
    for (let i = 0; i < list.length; i++) {
      setRows((r) => r.map((row, idx) => (idx === i ? { ...row, state: "enviando" } : row)));
      try {
        await sendOne(list[i]);
        setRows((r) => r.map((row, idx) => (idx === i ? { ...row, state: "pronto" } : row)));
      } catch (err) {
        setRows((r) =>
          r.map((row, idx) => (idx === i ? { ...row, state: "falhou", detail: err instanceof Error ? err.message : "erro" } : row)),
        );
      }
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <Label>Subir arquivos na mão (quando o download do link falhar)</Label>
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handle(e.target.files);
            e.target.value = "";
          }}
        />
        <button className="btn" onClick={() => inputRef.current?.click()}>
          Escolher vídeos
        </button>
        <span className="text-xs text-mute truncate-1">Entra no fim da fila, na ordem em que você selecionar.</span>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-1 text-xs">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex items-center gap-2 min-w-0">
              <Pill tone={r.state === "pronto" ? "green" : r.state === "falhou" ? "red" : r.state === "enviando" ? "amber" : "slate"}>{r.state}</Pill>
              <span className="truncate-1 flex-1">{r.name}</span>
              <span className="num text-mute shrink-0">{(r.size / 1e6).toFixed(1)} MB</span>
              {r.detail ? <span className="text-bad truncate-1 max-w-[220px]" title={r.detail}>{r.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
