"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/entrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha: value }),
    });
    setBusy(false);
    if (res.ok) {
      router.replace(params.get("depois") || "/");
      router.refresh();
      return;
    }
    const json = await res.json().catch(() => ({}));
    setError(json?.error ?? "Senha incorreta.");
  }

  return (
    <form onSubmit={submit} className="card p-5 w-full max-w-md flex flex-col gap-3">
      <h1 className="text-lg font-extrabold">Entrar na Fila TikTok</h1>
      <p className="text-sm text-mute">
        Senha definida em <code>APP_PASSWORD</code>. Nada aqui é público: sem senha, nada carrega.
      </p>
      <input
        className="field"
        type="password"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Senha"
        aria-label="Senha"
      />
      <button className="btn btn-good w-full justify-center" disabled={busy || !value}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Suspense fallback={null}>
        <Form />
      </Suspense>
    </div>
  );
}
