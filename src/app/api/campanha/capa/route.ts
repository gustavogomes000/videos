import { bad, fail, guard, ok } from "@/lib/api";
import { db, TABLE } from "@/lib/db";
import { env } from "@/lib/env";
import { uploadBytes } from "@/lib/media";
import { log, updateCampaign } from "@/lib/repo";

export const runtime = "nodejs";

const IMAGE_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const form = await req.formData().catch(() => null);
    if (!form) return bad("Envie o arquivo como multipart.");
    const campaignId = String(form.get("campaign_id") ?? "");
    const file = form.get("file");
    if (!campaignId || !(file instanceof File)) return bad("Faltam file ou campaign_id.");
    if (file.size > 4 * 1024 * 1024) return bad("Capa acima de 4 MB.");

    const ext = IMAGE_MIME[file.type];
    if (!ext) return bad("Use JPG, PNG ou WebP.");

    const account = await findAccountOfCampaign(campaignId);
    if (!account) return bad("Campanha não encontrada.");

    const path = `${account}/cover${ext}`;
    await uploadBytes(path, await file.arrayBuffer(), file.type);
    await updateCampaign(campaignId, { cover_path: path });
    await log({ account_id: account, kind: "import", message: "Capa geral atualizada." });

    return ok({ path: `/${env.storageBucket}/${path}` });
  } catch (err) {
    return fail(err);
  }
}

async function findAccountOfCampaign(campaignId: string): Promise<string | null> {
  const { data, error } = await db().from(TABLE.campaigns).select("account_id").eq("id", campaignId).maybeSingle();
  if (error) throw error;
  return (data?.account_id as string) ?? null;
}
