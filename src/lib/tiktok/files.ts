import { call } from "./api";

export interface OfficialVideo {
  video_id: string;
  title: string;
  create_time: number | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  cover_url: string | null;
  download_url: string | null;
}

function pickUrl(candidate: unknown): string | null {
  if (typeof candidate === "string") return candidate || null;
  if (Array.isArray(candidate)) return pickUrl(candidate[0]);
  if (candidate && typeof candidate === "object") {
    const c = candidate as Record<string, unknown>;
    return pickUrl(c.url) ?? pickUrl(c.url_list) ?? pickUrl(c.uri) ?? null;
  }
  return null;
}

function normalize(raw: any): OfficialVideo | null {
  const id = raw?.video_id ?? raw?.id ?? raw?.item_id;
  if (!id) return null;
  const v = raw?.video ?? raw ?? {};
  const download = pickUrl(v.download_addr) ?? pickUrl(v.download_url) ?? pickUrl(raw?.download_url) ?? pickUrl(v.play_addr);
  const createTime = raw?.create_time ?? raw?.creation_time ?? null;
  const durationMs = v.duration ?? raw?.duration ?? null;
  return {
    video_id: String(id),
    title: String(v.title ?? raw?.title ?? ""),
    create_time: createTime == null ? null : Number(createTime),
    duration_sec: durationMs == null ? null : Math.round(Number(durationMs) > 5000 ? Number(durationMs) / 1000 : Number(durationMs)),
    width: v.width ? Number(v.width) : null,
    height: v.height ? Number(v.height) : null,
    cover_url: pickUrl(v.cover) ?? pickUrl(v.cover_url) ?? pickUrl(v.thumbnail),
    download_url: download,
  };
}

/**
 * Puxa a lista dos vídeos *do próprio perfil* autorizados (Files API).
 * É o caminho oficial para recuperar os arquivos que você perdeu:
 * o TikTok devolve o endereço de download de cada publicação.
 */
export async function listPublishedVideos(token: string, openId: string, max = 300): Promise<OfficialVideo[]> {
  const out: OfficialVideo[] = [];
  let cursor = "0";
  for (let page = 0; page < 20 && out.length < max; page++) {
    const params: URLSearchParams = new URLSearchParams({ open_id: openId, count: "50", max_cursor: cursor });
    const data: Record<string, any> = await call(`/v2/video/list/?${params.toString()}`, { method: "GET", token });
    const list: unknown[] = data?.videos ?? data?.items ?? data?.list ?? [];
    for (const item of list) {
      const n = normalize(item);
      if (n) out.push(n);
    }
    const hasMore: boolean = Boolean(data?.has_more ?? data?.pagination?.has_more ?? false);
    const next: unknown = data?.next_cursor ?? data?.cursor ?? data?.pagination?.next_token;
    if (!hasMore || next == null || list.length === 0) break;
    cursor = String(next);
  }
  // Cronológica: o mais antigo primeiro, para repondo na ordem original.
  return out
    .filter((v) => v.video_id)
    .sort((a, b) => (a.create_time ?? 0) - (b.create_time ?? 0))
    .slice(0, max);
}
