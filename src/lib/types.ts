export const STATUS_ORDER = [
  "queued",
  "fetching",
  "awaiting_upload",
  "ready",
  "uploading",
  "publishing",
  "awaiting_manual",
  "published",
  "failed",
  "skipped",
] as const;

export type MediaStatus = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL: Record<MediaStatus, string> = {
  queued: "Importado",
  fetching: "Baixando",
  awaiting_upload: "Falta o arquivo",
  ready: "Na agenda",
  uploading: "Enviando",
  publishing: "Publicando",
  awaiting_manual: "Sua vez",
  published: "Publicado",
  failed: "Falhou",
  skipped: "Pulado",
};

/** verde = concluído · âmbar = acontecendo · azul = esperando · vermelho = problema · cinza = fora */
export const STATUS_TONE: Record<MediaStatus, "green" | "amber" | "blue" | "red" | "slate"> = {
  queued: "slate",
  fetching: "amber",
  awaiting_upload: "red",
  ready: "blue",
  uploading: "amber",
  publishing: "amber",
  awaiting_manual: "amber",
  published: "green",
  failed: "red",
  skipped: "slate",
};

export type AccountMode = "api" | "assisted";

export interface TikTokAccount {
  id: string;
  username: string | null;
  nickname: string | null;
  avatar_url: string | null;
  open_id: string | null;
  mode: AccountMode;
  interval_minutes: number;
  daily_cap: number;
  timezone: string;
  enabled: boolean;
  running: boolean;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  scopes: string | null;
  connected_at: string | null;
  last_post_at: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  account_id: string;
  name: string;
  general_caption: string;
  general_hashtags: string;
  cover_path: string | null;
  privacy_level: string;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  brand_organic: boolean;
  active: boolean;
  started_at: string | null;
  created_at: string;
}

export interface MediaItem {
  id: string;
  campaign_id: string;
  account_id: string;
  position: number;
  source_kind: "url" | "official" | "upload";
  source_url: string | null;
  tiktok_video_id: string | null;
  original_title: string | null;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  storage_path: string | null;
  cover_path: string | null;
  caption: string | null;
  status: MediaStatus;
  scheduled_at: string | null;
  published_at: string | null;
  publish_id: string | null;
  upload_url: string | null;
  upload_seq: number;
  total_chunks: number | null;
  chunk_size: number | null;
  public_post_url: string | null;
  attempts: number;
  error: string | null;
  created_at: string;
}

export interface ActivityRow {
  id: number;
  account_id: string | null;
  media_id: string | null;
  level: "info" | "warn" | "error";
  kind: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface AccountRollup {
  account_id: string;
  username: string | null;
  mode: AccountMode;
  enabled: boolean;
  running: boolean;
  interval_minutes: number;
  daily_cap: number;
  timezone: string;
  connected_at: string | null;
  last_post_at: string | null;
  total: number;
  published: number;
  scheduled: number;
  working: number;
  failed: number;
  skipped: number;
  next_at: string | null;
}
