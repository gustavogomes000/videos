"use client";

import { usePathname, useRouter } from "next/navigation";

export function ProfilePicker({ accounts, current }: { accounts: { id: string; label: string }[]; current: string | null }) {
  const router = useRouter();
  const pathname = usePathname();

  if (accounts.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto min-w-0">
      {accounts.map((a) => (
        <button
          key={a.id}
          className={`btn ${current === a.id ? "btn-good" : ""}`}
          onClick={() => router.replace(`${pathname}?perfil=${a.id}`)}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
