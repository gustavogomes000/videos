import { env } from "./env";
import { db } from "./db";

export interface ResolvedVideo {
  video_id: string | null;
  title: string;
  duration_sec: number | null;
  cover_url: string | null;
  download_url: string | null;
  author: string | null;
}

const TIKTOK_HOSTS = /(^|\.)(tiktok\.com|tiktokv\.com|vm\.tik\.tok|vt\.tik\.tok)$/i;

export function normalizeShareUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!TIKTOK_HOSTS.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function videoIdFromUrl(url: string): string | null {
  const m = url.match(/\/video\/(\d{6,20})/i) ?? url.match(/\/photo\/(\d{6,20})/i) ?? url.match(/(\d{19})/);
  return m ? m[1] : null;
}

/**
 * Resolve o endereço do arquivo sem marca d'água a partir do link público.
 * Usamos o tikwm como resolvedor porque o TikTok não expõe download por URL
 * na API oficial para terceiros. Se ele falhar, a tela deixa você subir o
 * arquivo na mão — a fila continua na mesma ordem.
 */
export async function resolveTikTokUrl(shareUrl: string): Promise<ResolvedVideo> {
  const api = new URL("https://www.tikwm.com/api/");
  api.searchParams.set("url", shareUrl);
  api.searchParams.set("hd", "1");

  const res = await fetch(api.toString(), {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (fila-tiktok)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Resolvedor respondeu ${res.status}.`);
  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: { id?: string; title?: string; duration?: number; cover?: string; play?: string; hdplay?: string; author?: { unique_id?: string } };
  };
  if (json.code && json.code !== 0) throw new Error(json.msg || "Não foi possível resolver este link.");
  const d = json.data;
  if (!d?.play) throw new Error("O resolvedor não devolveu o arquivo deste link.");

  return {
    video_id: d.id ? String(d.id) : videoIdFromUrl(shareUrl),
    title: d.title ?? "",
    duration_sec: d.duration != null ? Number(d.duration) : null,
    cover_url: d.cover ? absolute(d.cover) : null,
    download_url: absolute(d.hdplay || d.play),
    author: d.author?.unique_id ?? null,
  };
}

function absolute(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.tiktok.com${value.startsWith("/") ? "" : "/"}${value}`;
}

export async function headSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store" });
    const len = res.headers.get("content-length");
    return len ? Number(len) : null;
  } catch {
    return null;
  }
}

/** Baixa para dentro do Storage. Tenta streaming primeiro para não estourar memória. */
export async function downloadIntoStorage(opts: { url: string; path: string; contentType: string; maxBytes: number }): Promise<{ size: number }> {
  const headers = { "User-Agent": "Mozilla/5.0 (fila-tiktok)", Accept: "*/*", Referer: "https://www.tiktok.com/" };
  const res = await fetch(opts.url, { headers, redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`Download falhou (${res.status}).`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > opts.maxBytes) throw new Error(`Arquivo de ${(declared / 1e6).toFixed(0)} MB acima do limite de ${(opts.maxBytes / 1e6).toFixed(0)} MB.`);

  if (res.body) {
    const up = await db().storage.from(env.storageBucket).upload(opts.path, res.body as unknown as BodyInit, {
      contentType: opts.contentType,
      upsert: true,
    });
    if (!up.error) {
      const size = declared || (await headSize(opts.url)) || 0;
      return { size };
    }
    // alguns CDNs recusam corpo em streaming; o stream já foi consumido, então
    // a volta em memória precisa de uma resposta nova, não desta mesma.
  }

  const retry = await fetch(opts.url, { headers, redirect: "follow", cache: "no-store" });
  if (!retry.ok) throw new Error(`Download (2ª tentativa) falhou (${retry.status}).`);
  const buffer = await retry.arrayBuffer();
  if (buffer.byteLength > opts.maxBytes) throw new Error(`Arquivo de ${(buffer.byteLength / 1e6).toFixed(0)} MB acima do limite.`);
  const up = await db().storage.from(env.storageBucket).upload(opts.path, buffer, {
    contentType: opts.contentType,
    upsert: true,
  });
  if (up.error) throw new Error(up.error.message);
  return { size: buffer.byteLength };
}

export async function uploadBytes(path: string, body: BodyInit, contentType: string) {
  const { error } = await db().storage.from(env.storageBucket).upload(path, body as any, { contentType, upsert: true });
  if (error) throw new Error(error.message);
}

/** URL assinada: o TikTok baixa por ela (modo PULL_FROM_URL) e você assiste na tela. */
export async function signedUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await db().storage.from(env.storageBucket).createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function removeStorageObject(path: string) {
  await db().storage.from(env.storageBucket).remove([path]).catch(() => undefined);
}

export function buildVideoPath(accountId: string, mediaId: string, mimeHint?: string | null, filename?: string | null): string {
  const fromName = filename?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const ext = fromName ?? (mimeHint?.includes("quicktime") ? "mov" : mimeHint?.includes("webm") ? "webm" : "mp4");
  return `${accountId}/${mediaId}.${ext}`;
}
