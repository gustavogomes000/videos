import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { buildVideoPath } from "@/lib/media";
import { getAccount, getActiveCampaign, insertMedia, log, maxPosition, updateMedia } from "@/lib/repo";

export const runtime = "nodejs";

const ALLOWED = ["video/mp4", "video/quicktime", "video/webm"];

/**
 * Abre um canal de upload direto para o Storage e cria a linha na fila.
 * O arquivo não passa pela função do Vercel (limite de 4,5 MB no corpo).
 */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ account_id?: string; filename?: string; mime?: string; size?: number }>(req);
    if (!body?.account_id) return bad("account_id obrigatório.");

    const account = await getAccount(body.account_id);
    if (!account) return bad("Perfil não encontrado.");
    const mime = body.mime && ALLOWED.includes(body.mime) ? body.mime : "video/mp4";
    const size = Number(body.size ?? 0);
    if (size <= 0) return bad("Tamanho do arquivo inválido.");
    if (size > 1024 * 1024 * 1024) return bad("Acima de 1 GB — o TikTok não aceita e o bucket também não.");

    const campaign = await getActiveCampaign(account.id);
    const pos = (await maxPosition(campaign.id)) + 1000;
    const [created] = await insertMedia([
      {
        campaign_id: campaign.id,
        account_id: account.id,
        position: pos,
        source_kind: "upload",
        filename: (body.filename ?? "video.mp4").slice(0, 120),
        mime_type: mime,
        size_bytes: size,
        status: "awaiting_upload",
        original_title: (body.filename ?? "").replace(/\.[a-z0-9]+$/i, "").slice(0, 120),
      },
    ]);
    if (!created) return bad("Não foi possível criar a linha na fila.");

    const path = buildVideoPath(account.id, created.id, mime, body.filename);
    await updateMedia(created.id, { storage_path: path });

    const signed = await db().storage.from(env.storageBucket).createSignedUploadUrl(path);
    if (signed.error || !signed.data) return bad(signed.error?.message ?? "Não foi possível assinar o upload.");

    // Mesma montagem que o cliente do Supabase faz: barra do caminho fica intacta.
    const uploadUrl = `${(env.supabaseUrl ?? "").replace(/\/$/, "")}/storage/v1/object/sign/${env.storageBucket}/${
      signed.data.path
    }?token=${encodeURIComponent(signed.data.token)}`;

    await log({ account_id: account.id, media_id: created.id, kind: "import", message: `Aberto upload direto de ${(size / 1e6).toFixed(1)} MB.` });

    return ok({ media_id: created.id, upload_url: uploadUrl, path });
  } catch (err) {
    return fail(err);
  }
}
