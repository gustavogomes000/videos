import { signPayload, verifySignature } from "../crypto";

/** Estado do OAuth: amarra o callback ao perfil que pediu a conexão. */
export function makeState(accountId: string): string {
  return `${accountId}.${signPayload(accountId)}`;
}

export function readState(state: string | null): string | null {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot < 0) return null;
  const id = state.slice(0, dot);
  return verifySignature(id, state.slice(dot + 1)) ? id : null;
}
