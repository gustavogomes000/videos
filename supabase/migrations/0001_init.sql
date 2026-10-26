-- =====================================================================
-- Fila TikTok — schema inicial
-- Rodar no SQL Editor do Supabase (ou `npm run db:push`)
--
-- Ferramenta de um operador só: o acesso é protegido por senha (APP_PASSWORD)
-- e o servidor fala com o banco usando a service_role key. Nenhuma tabela
-- fica exposta no anon key, então não há RLS para manter.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Perfis TikTok conectados (um por conta do TikTok)
-- ---------------------------------------------------------------------
create table if not exists tiktok_accounts (
  id                  uuid primary key default gen_random_uuid(),

  username            text,
  nickname            text,
  avatar_url          text,
  open_id             text,

  -- 'api'      = publica sozinho via Content Posting API
  -- 'assisted' = prepara o pacote e avisa na hora; você toca em Publicar
  mode                text not null default 'assisted' check (mode in ('api', 'assisted')),

  interval_minutes    integer  not null default 360 check (interval_minutes between 5 and 10080),
  daily_cap           integer  not null default 3    check (daily_cap between 1 and 20),
  timezone            text     not null default 'America/Sao_Paulo',

  enabled             boolean  not null default true,
  running             boolean  not null default false,

  token_enc           text,
  token_expires_at    timestamptz,
  refresh_expires_at  timestamptz,
  scopes              text,
  connected_at        timestamptz,

  last_post_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Campanhas: um lote de vídeos com legenda geral + capa geral + ritmo.
-- Cada perfil tem sempre uma campanha ativa.
-- ---------------------------------------------------------------------
create table if not exists campaigns (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references tiktok_accounts (id) on delete cascade,

  name                text not null default 'Recuperação',
  general_caption     text not null default '',
  general_hashtags    text not null default '',
  cover_path          text,

  privacy_level       text not null default 'PUBLIC_TO_EVERYONE'
                      check (privacy_level in ('PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS',
                                               'FOLLOWER_OF_CREATOR', 'SELF_ONLY')),
  disable_comment     boolean not null default false,
  disable_duet        boolean not null default true,
  disable_stitch      boolean not null default true,
  brand_organic       boolean not null default false,

  active              boolean not null default true,
  started_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists campaigns_account_idx on campaigns (account_id, active);

-- ---------------------------------------------------------------------
-- Itens da fila: o vídeo, a ordem dele e o estado da máquina.
-- `position` é numérico e aceita buracos — arrastar usa a média entre os
-- vizinhos, então a ordem que você já arrumou é preservada de verdade.
-- ---------------------------------------------------------------------
create table if not exists media (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references campaigns (id) on delete cascade,
  account_id          uuid not null references tiktok_accounts (id) on delete cascade,

  position            numeric not null,
  source_kind         text not null check (source_kind in ('url', 'official', 'upload')),

  source_url          text,
  tiktok_video_id     text,
  original_title      text,

  filename            text,
  mime_type           text,
  size_bytes          bigint,
  duration_sec        integer,
  width               integer,
  height              integer,

  storage_path        text,
  cover_path          text,
  caption             text,

  status              text not null default 'queued' check (status in (
                        'queued',              -- importado, sem arquivo ainda
                        'fetching',            -- baixando do URL
                        'awaiting_upload',     -- download falhou: precisa enviar o arquivo
                        'ready',               -- arquivo no Storage, aguardando o horário
                        'uploading',           -- empurrando chunks pro TikTok
                        'publishing',          -- init enviado, aguardando o TikTok confirmar
                        'awaiting_manual',     -- assistido: é sua vez de tocar em Publicar
                        'published',
                        'failed',
                        'skipped'
                      )),

  scheduled_at        timestamptz,
  published_at        timestamptz,

  publish_id          text,
  upload_url          text,
  upload_seq          integer not null default 0,
  total_chunks        integer,
  chunk_size          integer,
  public_post_url     text,

  attempts            integer not null default 0,
  next_attempt_at     timestamptz not null default now(),
  error               text,
  lease_until         timestamptz,
  locked_by           text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists media_campaign_order_idx on media (campaign_id, position);
create index if not exists media_due_idx on media (account_id, status, scheduled_at);

-- ---------------------------------------------------------------------
-- Trilha do que aconteceu em cada passo
-- ---------------------------------------------------------------------
create table if not exists activity_log (
  id          bigint generated always as identity primary key,
  account_id  uuid references tiktok_accounts (id) on delete cascade,
  media_id    uuid references media (id) on delete set null,
  level       text not null default 'info' check (level in ('info', 'warn', 'error')),
  kind        text not null,
  message     text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists activity_log_time_idx on activity_log (created_at desc);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tiktok_accounts', 'campaigns', 'media'] loop
    execute format('drop trigger if exists trg_%s_touch on public.%I', t, t);
    execute format('create trigger trg_%s_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- Uma única campanha ativa por perfil.
create unique index if not exists campaigns_one_active_per_account
  on campaigns (account_id) where active;

-- ---------------------------------------------------------------------
-- Storage: bucket privado para vídeos e capas.
-- Só o service role mexe aqui; o navegador usa URL assinada.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tiktok-media', 'tiktok-media', false, 536870912,
        array['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Métricas prontas para o dashboard
-- ---------------------------------------------------------------------
create or replace view account_rollup as
select
  a.id                                                as account_id,
  a.username,
  a.mode,
  a.enabled,
  a.running,
  a.interval_minutes,
  a.daily_cap,
  a.timezone,
  a.connected_at,
  a.last_post_at,
  count(m.id)                                          as total,
  count(m.id) filter (where m.status = 'published')    as published,
  count(m.id) filter (where m.status in ('ready','awaiting_manual')) as scheduled,
  count(m.id) filter (where m.status in ('queued','fetching','awaiting_upload','uploading','publishing')) as working,
  count(m.id) filter (where m.status = 'failed')       as failed,
  count(m.id) filter (where m.status = 'skipped')      as skipped,
  min(m.scheduled_at) filter (where m.status in ('ready','awaiting_manual')) as next_at
from tiktok_accounts a
left join media m on m.account_id = a.id
group by a.id;
