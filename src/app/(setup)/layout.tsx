import { AppChrome } from "@/components/chrome";
import { requireSession } from "@/lib/session";

/** Config abre sem banco: é a tela que explica como criar o banco. */
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return <AppChrome accounts={null}>{children}</AppChrome>;
}
