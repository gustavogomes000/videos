import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Fila TikTok",
  description: "Recupera, ordena e reaproveita seus vídeos do TikTok no seu ritmo.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-ink text-mist">{children}</body>
    </html>
  );
}
