import { bad, bodyAs, fail, guard, ok, str } from "@/lib/api";
import { updateCampaign } from "@/lib/repo";
import type { Campaign } from "@/lib/types";

export const runtime = "nodejs";

const PRIVACY = new Set(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]);

export async function PATCH(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<Record<string, unknown>>(req);
    if (!body?.id || typeof body.id !== "string") return bad("id obrigatório.");

    const patch: Partial<Campaign> = {};
    if (typeof body.name === "string") patch.name = str(body.name, 80);
    if (typeof body.general_caption === "string") patch.general_caption = str(body.general_caption, 2000);
    if (typeof body.general_hashtags === "string") patch.general_hashtags = str(body.general_hashtags, 300);
    if (typeof body.privacy_level === "string" && PRIVACY.has(body.privacy_level)) patch.privacy_level = body.privacy_level;
    for (const flag of ["disable_comment", "disable_duet", "disable_stitch", "brand_organic"] as const) {
      if (typeof body[flag] === "boolean") patch[flag] = body[flag] as boolean;
    }

    await updateCampaign(body.id, patch);
    return ok();
  } catch (err) {
    return fail(err);
  }
}
