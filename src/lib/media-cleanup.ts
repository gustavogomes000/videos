import { db } from "./db";
import { env } from "./env";

/** Apagar um perfil também limpa os arquivos dele no Storage (cobrança de armazenamento). */
export async function removeAccountStorage(accountId: string): Promise<number> {
  const storage = db().storage.from(env.storageBucket);
  let removed = 0;

  for (let page = 0; page < 40; page++) {
    const { data, error } = await storage.list(`${accountId}/`, { limit: 100 });
    if (error || !data?.length) break;
    const paths = data.map((f) => `${accountId}/${f.name}`);
    const { error: rmError } = await storage.remove(paths);
    if (rmError) break;
    removed += paths.length;
    if (data.length < 100) break;
  }

  return removed;
}
