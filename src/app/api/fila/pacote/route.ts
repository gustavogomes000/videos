import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { findActiveCampaign, getMedia } from "@/lib/repo";
import { signedUrl } from "@/lib/media";
import { composeCaption } from "@/lib/worker";
import { isAuthed } from "@/lib/session";

export const runtime = "nodejs";

/** O pacote da hora: arquivo, legenda pronta, capa e o link original. */
export async function GET(req: Request) {
  if (!(await isAuthed())) return bad("Entre de novo.", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return bad("id obrigatório.");

  const item = await getMedia(id);
  if (!item) return bad("Item não encontrado.", 404);
  const campaign = await findActiveCampaign(item.account_id);

  const videoUrl = item.storage_path ? await signedUrl(item.storage_path, 60 * 60) : null;
  const coverSource = item.cover_path ?? campaign?.cover_path ?? null;
  const coverUrl = coverSource ? await signedUrl(coverSource, 60 * 60) : null;

  return NextResponse.json({
    video_url: videoUrl,
    cover_url: coverUrl,
    filename: item.filename,
    original_url: item.source_kind === "url" ? item.source_url : null,
    caption: campaign ? composeCaption(campaign, item) : (item.caption ?? ""),
  });
}
