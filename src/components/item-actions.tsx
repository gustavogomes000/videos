"use client";

import { useRouter } from "next/navigation";

export function AccountSwitch({ accountId, running, disabled }: { accountId: string; running: boolean; disabled: boolean }) {
  const router = useRouter();
  return (
    <button
      className={`btn ${running ? "btn-good" : ""}`}
      disabled={disabled}
      title={disabled ? "Este perfil ainda não foi conectado." : "Liga ou desliga este perfil da automação"}
      onClick={async () => {
        const res = await fetch("/api/perfis/rodar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: accountId, running: !running }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          alert(json?.error ?? "Não foi possível alterar.");
          return;
        }
        router.refresh();
      }}
    >
      <span className={`dot ${running ? "bg-good pulse" : "bg-off"}`} aria-hidden />
      {running ? "Ativo" : "Parado"}
    </button>
  );
}
