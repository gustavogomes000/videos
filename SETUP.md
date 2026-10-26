# Fila TikTok — montar em 30 minutos

Recupera vídeos do TikTok, mantém a ordem que você já arrumou, agenda no ritmo de cada perfil e publica.

Dois modos de publicar, no mesmo painel:

| Modo | O que acontece | Precisa de quê |
|---|---|---|
| **assistido** | a ferramenta baixa, ordena, agenda e, na hora exata, te entrega o pacote (arquivo + legenda pronta). Você toca em Publicar. | nada — funciona no primeiro dia |
| **API oficial** | a ferramenta publica sozinha pelo TikTok. | app criado no TikTok for Developers com o escopo `video.publish` aprovado |

Comece em assistido. A fila, a ordem e o ritmo são idênticos nos dois modos, então quando o app for aprovado você só troca a chave "Publicação" no perfil.

---

## 1. Supabase (banco + arquivo + cofre)

1. Crie um projeto em `supabase.com` (o plano free serve).
2. Abra **SQL Editor** → **New query**.
3. Cole **todo** o conteúdo de `supabase/migrations/0001_init.sql` e clique **Run**.
   Isso cria as tabelas, o bucket privado `tiktok-media` e a visão de métricas.
4. **Project Settings → API**: copie a **URL**, a **anon key** e a **service_role key**.

## 2. Rodar local

```bash
cp .env.example .env.local   # cole as chaves e crie as três senhas
npm install
npm run dev                  # http://localhost:3000
```

Abra `http://localhost:3000`, entre com a `APP_PASSWORD` e vá em **Config**: tudo verde significa que está pronto.

## 3. Vercel

1. Suba esta pasta para um repositório e **Import** na Vercel.
2. Cole as mesmas variáveis (as de servidor como *Sensitive*).
3. Defina `NEXT_PUBLIC_APP_URL` com o domínio final, ex. `https://sua-fila.vercel.app`.
4. O `vercel.json` já traz o cron de 1 em 1 minuto chamando `/api/fila/rodar-cron`, que é o que faz o processo andar sozinho.

**Se o plano não permitir cron a cada minuto** (o Hobby tem limite de agenda), o cron fica inútil mas nada quebra: o botão **Rodar agora** no topo faz exatamente a mesma passada. Alternativa sem depender da Vercel: um cron externo (GitHub Actions, UptimeRobot) chamando `POST /api/fila/rodar-cron` com `Authorization: Bearer <CRON_SECRET>` a cada minuto.

## 4. App do TikTok (só para o modo API)

1. `developers.tiktok.com` → **Create app**.
2. Produtos: **LoginKit (v2)** e **Content Posting API**.
3. Escopos: `user.info.basic`, `video.list`, `video.publish`.
4. **Redirect URL**: `https://SEU-DOMINIO/api/tiktok/callback` (idem para `http://localhost:3000/...` durante os testes).
5. Copie **Client key** e **Client secret** para `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`.
6. Em **Perfis → Conectar ao TikTok**, autorize cada conta (um clique por conta, nenhuma senha digitada aqui).
7. Peça a auditoria do app para liberar `video.publish`. Enquanto ela não chega, o TikTok devolve a publicação como rascunho no app — a tela mostra isso como **"TikTok devolveu rascunho"** e você continua do modo assistido.

## 5. Usar

1. **Perfis** → criar um perfil por conta, definir intervalo e teto diário.
2. **Importar** → colar os links **na ordem em que devem ser publicados** (linha 1 vira o vídeo 001). Definir legenda geral e capa geral.
3. **Fila** → arrastar para corrigir a ordem se precisar, conferir a agenda, ligar a automação.
4. **Painel** → acompanhar o anel de progresso, o contador do próximo post e a seção "Sua vez".
5. **Registro** → ver passo a passo o que aconteceu e o que falhou.

---

## O que a ferramenta resolve e o que ela não resolve

- **Ordem é lei.** A posição é um número com buracos entre si: arrastar uma linha não reescreve a fila inteira, e nada muda de lugar sozinho.
- **Ritmo por perfil.** Cada perfil tem intervalo próprio (de 5 min a 7 dias) e teto por dia local, respeitando o fuso. Dois perfis nunca brigam pelo mesmo vídeo.
- **Retomável.** Se um passo falhar no meio (download, upload, publicação), o estado fica no banco e a próxima tentativa continua dali. Erros voltam a tentar com espera dobrando, e depois de 5 tentativas o item pede sua atenção em vez de travar a fila.
- **Limite real do TikTok.** Publicar pela API tem teto de 6 chamadas/min por token e teto diário por conta. O worker respeita os dois; aumentar demais o volume só faz o TikTok recusar.
- **Download por link usa um resolvedor de terceiros.** O TikTok não expõe "baixe este vídeo" na API oficial para links públicos. Se um link falhar, o item cai em **"Falta o arquivo"** e a tela de Importar aceita o arquivo na mão sem perder a posição na fila.
- **Seus vídeos, sua conta.** Não há automação de senha, nem sessão falsa, nem bot de navegador. É OAuth oficial ou você mesmo tocando em Publicar.
