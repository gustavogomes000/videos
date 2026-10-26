"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Painel" },
  { href: "/perfis", label: "Perfis" },
  { href: "/importar", label: "Importar" },
  { href: "/fila", label: "Fila" },
  { href: "/registro", label: "Registro" },
  { href: "/config", label: "Config" },
];

export function Nav({ running }: { running: boolean }) {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
              active ? "bg-panel-2 text-mist" : "text-mute hover:text-mist"
            }`}
          >
            {t.label}
            {t.href === "/fila" && running ? <span className="dot bg-live pulse ml-1.5 inline-block" aria-hidden /> : null}
          </Link>
        );
      })}
    </div>
  );
}
