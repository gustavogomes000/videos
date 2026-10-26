import { env } from "../env";
import { call, callTryingGet, TikTokApiError } from "./api";

export type PublishState =
  | "PENDING"
  | "PROCESSING_DOWNLOAD"
  | "SEND_TO_USER"
  | "PUBLISH_COMPLETE"
  | "FAILED";

export interface InitResponse {
  publish_id: string;
  publish_target?: string;
  upload_url?: string;
}

export interface StatusResponse {
  publish_id: string;
  status: PublishState;
  fail_reason?: string;
  publicaly_available_post_id?: string[] | string;
  uploaded_bytes?: number;
}

export interface PostInfo {
  title: string;
  privacy_level: string;
  disable_comment?: boolean;
  disable_duet?: boolean;
  disable_stitch?: boolean;
  brand_content_toggle?: boolean;
  brand_organic_toggle?: boolean;
  is_aigc?: boolean;
}

const MAX_TITLE = 2200;

export function clampCaption(text: string): string {
  return text.slice(0, MAX_TITLE);
}

/**
 * Rota padrão: o TikTok baixa o vídeo a partir de uma URL assinada do nosso
 * Storage. Uma chamada só, sem fatiar arquivo em pedaços.
 */
export async function initFromUrl(opts: { token: string; post: PostInfo; externalUrl: string; coverUrl?: string | null }): Promise<InitResponse> {
  const body = {
    post_info: { ...opts.post, title: clampCaption(opts.post.title) },
    source_info: {
      source: "PULL_FROM_URL",
      external_url: opts.externalUrl,
      ...(opts.coverUrl ? { video_cover: opts.coverUrl } : {}),
    },
  };
  const data = await call<{ publish_id: string; publish_target?: string; upload_url?: string }>(
    "/v2/post/publish/video/init/",
    { method: "POST", token: opts.token, body },
  );
  if (!data?.publish_id) throw new TikTokApiError("O TikTok não devolveu um publish_id.");
  return data;
}

/** Rota alternativa: upload fatiado a partir do nosso servidor, retomável entre ticks. */
export async function initFileUpload(opts: {
  token: string;
  post: PostInfo;
  videoSize: number;
  chunkSize?: number;
}): Promise<InitResponse> {
  const chunkSize = opts.chunkSize ?? env.chunkSize;
  const total = Math.max(1, Math.ceil(opts.videoSize / chunkSize));
  const body = {
    post_info: { ...opts.post, title: clampCaption(opts.post.title) },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: opts.videoSize,
      chunk_size: chunkSize,
      total_chunk_count: total,
    },
  };
  const data = await call<{ publish_id: string; upload_url?: string }>("/v2/post/publish/video/init/", {
    method: "POST",
    token: opts.token,
    body,
  });
  if (!data?.publish_id) throw new TikTokApiError("O TikTok não devolveu um publish_id.");
  return { ...data, upload_url: data.upload_url };
}

/**
 * Envia um pedaço. `seq` é 1-based, igual ao cabeçalho que o TikTok espera.
 * O upload_url já carrega a autorização, não entra Bearer aqui.
 */
export async function pushChunk(opts: {
  uploadUrl: string;
  bytes: ArrayBuffer;
  seq: number;
  totalChunks: number;
  videoSize: number;
}): Promise<{ uploaded: number }> {
  const start = (opts.seq - 1) * opts.bytes.byteLength;
  const end = start + opts.bytes.byteLength - 1;
  const res = await fetch(opts.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Range": `bytes ${start}-${end}/${opts.videoSize}`,
      "Content-Length": String(opts.bytes.byteLength),
      "x-upload-seq": String(opts.seq),
      "x-upload-total-parts": String(opts.totalChunks),
      "x-video-size": String(opts.videoSize),
    },
    body: opts.bytes,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TikTokApiError(`Falha ao enviar o pedaço ${opts.seq}/${opts.totalChunks} (${res.status}). ${text.slice(0, 160)}`.trim(), {
      status: res.status,
    });
  }
  return { uploaded: end + 1 };
}

export async function publishStatus(token: string, publishId: string): Promise<StatusResponse> {
  return callTryingGet<StatusResponse>("/v2/post/publish/status/fetch/", { publish_id: publishId }, token);
}

export function postUrlFromId(postId: string | undefined | null): string | null {
  if (!postId) return null;
  return `https://www.tiktok.com/@/video/${postId}`;
}
