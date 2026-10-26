import Link from "next/link";
import { Section, Pill, Label } from "@/components/parts";
import { explainError, db } from "@/lib/db";
import { appBaseUrl, env, missingRequiredConfig, tiktokAppConfigured } from "@/lib/env";
import { listAccounts } from "@/lib/repo";

export const dynamic = "force-dynamic";

interface Row {
  ok: boolean;
  name: string;
  detail: string;
  fix: string;
}

export default async function ConfigPage() {
  const missing = new Set(missingRequiredConfig());

  let dbOk = false;
  let dbError = "";
  try {
    await listAccounts();
    dbOk = true;
  } catch (err) {
    dbError = explainError(err);
  }

  let bucketOk = false;
  let bucketName = env.storageBucket;
  try {
    const res = await db().storage.getBucket(bucketName);
    bucketOk = Boolean(res.data);
  } catch {
    bucketOk = false;
  }

  const rows: Row[] = [
    {
      ok: !missing.has("NEXT_PUBLIC_SUPABASE_URL"),
      name: "Supabase (URL + anon)",
      detail: env.supabaseUrl ? env.supabaseUrl : "não configurado",
      fix: "Painel Supabase → Project Settings → API → copiate URL e anon key em .env.local.",
    },
    {
      ok: !missing.has("SUPABASE_SERVICE_ROLE_KEY"),
      name: "Service role key",
      detail: env.supabaseServiceKey ? "presente (nunca vai ao navegador)" : "não configurado",
      fix: "Mesma tela do Supabase, chave service_role. Só no servidor.",
    },
    {
      ok: dbOk,
      name: "Migration aplicada",
      detail: dbOk ? "banco respondendo" : dbError.slice(0, 160),
      fix: "SQL Editor do Supabase → colar inteiro o conteúdo de supabase/migrations/0001_init.sql → Run.",
    },
    {
      ok: bucketOk,
      name: `Bucket ${bucketName}`,
      detail: bucketOk ? "existe e é privado" : "não encontrado",
      fix: "A migration cria o bucket. Se você criou o projeto antes dela, rode a migration de novo.",
    },
    {
      ok: !missing.has("APP_PASSWORD"),
      name: "Senha da ferramenta",
      detail: env.appPassword ? "definida" : "não configurada",
      fix: "APP_PASSWORD=nothing-a-ser-facil (qualquer string longa).",
    },
    {
      ok: !missing.has("APP_ENCRYPTION_KEY"),
      name: "Chave de cifra dos tokens",
      detail: env.encryptionKey ? "definida" : "não configurada",
      fix: "APP_ENCRYPTION_KEY=outra-string-longa. Mudar depois invalida os tokens já conectados.",
    },
    {
      ok: !missing.has("CRON_SECRET"),
      name: "Segredo do cron",
      detail: env.cronSecret ? "definida" : "não configurada",
      fix: "CRON_SECRET=mais-uma-string-longa. O Vercel usa como Bearer no cron.",
    },
    {
      ok: tiktokAppConfigured(),
      name: "App do TikTok",
      detail: tiktokAppConfigured() ? `client key ${env.tiktokClientKey?.slice(0, 8)}…` : "não configurado — modo assistido continua funcionando",
      fix: "developers.tiktok.com → Create app → Products: Login (user.info.basic) + Content Posting (video.list, video.publish) → Redirect URL = o callback abaixo.",
    },
  ];

  const callback = `${appBaseUrl()}/api/tiktok/callback`;
  const tickUrl = `${appBaseUrl()}/api/fila/rodar-cron`;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <Section title="Estado" hint="Tudo verde = a ferramenta funciona de ponta a ponta.">
        <ul className="flex flex-col min-w-0">
          {rows.map((r) => (
            <li key={r.name} className="row-line py-3 flex items-start gap-3 min-w-0">
              <Pill tone={r.ok ? "green" : "red"}>{r.ok ? "ok" : "falta"}</Pill>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate-1">{r.name}</p>
                <p className="text-xs text-mute truncate-1" title={r.detail}>
                  {r.detail}
                </p>
                {!r.ok ? <p className="text-xs text-mist/80 mt-1 break-words">{r.fix}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Endereços que você precisa copiar" hint="São os dois valores que mudam quando o projeto sobe.">
        <div className="flex flex-col gap-4 min-w-0">
          <div>
            <Label>Callback do OAuth (cadastre no app do TikTok)</Label>
            <code className="field block break-all">{callback}</code>
          </div>
          <div>
            <Label>URL do cron do Vercel</Label>
            <code className="field block break-all">{tickUrl}</code>
            <p className="text-xs text-mute mt-2">
              O arquivo <code>vercel.json</code> já chama isso a cada minuto. Sem o cron ligado, nada sobe sozinho — use “Rodar agora” no topo.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Deploy em duas frentes" hint="Supabase guarda tudo; Vercel só executa.">
        <ol className="text-sm text-mist/85 flex flex-col gap-2 list-decimal pl-5">
          <li>Crie o projeto no Supabase (free basta) e rode a migration.</li>
          <li>Importe este repositório no Vercel e cole as variáveis acima (inclusive as de servidor, marcadas comoSensitive).</li>
          <li>Defina <code>NEXT_PUBLIC_APP_URL</code> com o domínio final para o OAuth bater.</li>
          <li>Publique, abra <code>/perfis</code> e conecte o primeiro perfil.</li>
        </ol>
        <p className="text-xs text-mute mt-4">
          Sobre publicar sozinho: o TikTok exige auditoria do app para o escopo <code>video.publish</code>. Até lá o perfil fica em modo assistido — a fila, a ordem e o ritmo continuam exatamente os mesmos.{" "}
          <Link href="/perfis" className="text-wait underline">
            Ir para Perfis
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
