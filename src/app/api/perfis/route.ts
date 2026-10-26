import { NextResponse } from "next/server";
import { bad, bodyAs, fail, guard, int, ok } from "@/lib/api";
import { createAccount, updateAccount } from "@/lib/repo";
import type { AccountMode } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<Record<string, unknown>>(req);
    if (!body) return bad("Corpo inválido.");
    const account = await createAccount({
      username: typeof body.username === "string" ? body.username.trim().slice(0, 60) : null,
      mode: (body.mode === "api" ? "api" : "assisted") as AccountMode,
      interval_minutes: int(body.interval_minutes, 360),
      daily_cap: int(body.daily_cap, 3),
    });
    return ok({ id: account.id });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = await bodyAs<Record<string, unknown>>(req);
    if (!body?.id || typeof body.id !== "string") return bad("id obrigatório.");

    const patch: Record<string, unknown> = {};
    if (typeof body.username === "string") patch.username = body.username.trim().slice(0, 60);
    if (body.mode === "api" || body.mode === "assisted") patch.mode = body.mode;
    if (body.interval_minutes !== undefined) patch.interval_minutes = Math.min(10080, Math.max(5, int(body.interval_minutes, 360)));
    if (body.daily_cap !== undefined) patch.daily_cap = Math.min(20, Math.max(1, int(body.daily_cap, 3)));
    if (typeof body.timezone === "string") patch.timezone = body.timezone.slice(0, 60);
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

    await updateAccount(String(body.id), patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
