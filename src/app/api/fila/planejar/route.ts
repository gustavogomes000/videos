import { bad, bodyAs, fail, guard, ok } from "@/lib/api";
import { getAccount, getActiveCampaign, listMedia, log, updateMedia } from "@/lib/repo";
import { planSchedule } from "@/lib/scheduler";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Monta a agenda na hora (o cron também faz isso sozinho).
 * `dobrar` = recomeça do zero, ignorando o que já estava marcado.
 */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<{ account_id?: string; dobrar?: boolean; comecar_em?: string }>(req);
    if (!body?.account_id) return bad("account_id obrigatório.");

    const account = await getAccount(body.account_id);
    if (!account) return bad("Perfil não encontrado.");
    const campaign = await getActiveCampaign(account.id);
    const all = await listMedia(campaign.id);

    const targets = all.filter((i) => {
      // Só o que já tem arquivo de verdade no cofre ('ready'). Um item à espera
      // do seu upload já tem storage_path reservado, mas o arquivo não chegou.
      if (i.status !== "ready") return false;
      return body.dobrar ? true : !i.scheduled_at;
    });
    if (!targets.length) return ok({ assigned: 0, firstAt: null, days: 0, note: "Nada novo para agendar." });

    if (body.dobrar) {
      for (const i of targets) await updateMedia(i.id, { scheduled_at: null });
    }

    const plan = await planSchedule(account, targets, {
      startFrom: body.comecar_em ? new Date(body.comecar_em) : undefined,
      respectLastPost: !body.dobrar,
    });

    await log({
      account_id: account.id,
      kind: "schedule",
      message: `Agenda montada: ${plan.assigned.length} vídeo(s) do ${plan.firstAt ? new Date(plan.firstAt).toLocaleString("pt-BR") : "—"} até ${
        plan.lastAt ? new Date(plan.lastAt).toLocaleString("pt-BR") : "—"
      }.`,
    });

    return ok({ assigned: plan.assigned.length, firstAt: plan.firstAt, lastAt: plan.lastAt, days: plan.daysSpanned });
  } catch (err) {
    return fail(err);
  }
}
