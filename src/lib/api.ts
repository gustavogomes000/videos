import { NextResponse } from "next/server";
import { explainError } from "./db";
import { isAuthed } from "./session";

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function ok(payload: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...payload });
}

/** Toda mutação passa aqui: sem sessão, nada acontece. */
export async function guard(req: Request): Promise<NextResponse | null> {
  if (req.method === "GET") return null;
  if (!(await isAuthed())) return bad("Sessão expirada. Entre de novo.", 401);
  return null;
}

export async function bodyAs<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function fail(err: unknown) {
  const message = explainError(err);
  console.error("[api]", message);
  return bad(message, 500);
}

export function int(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function str(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}
