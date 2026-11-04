import type { createMobileClient } from "./index.ts";
import type { EncryptedStorage, OfflineQueuedOperation } from "./storage.ts";
import { awaitActiveSync } from "./sync.ts";

export type SignOutStatus = "signed_out" | "signed_out_unrevoked" | "purge_failed";

export interface SignOutResult {
  status: SignOutStatus;
  /** El servidor confirmó (o ya no reconocía) la sesión revocada. Falso si no se pudo contactar. */
  revoked: boolean;
  /** Los datos privados de la cuenta se borraron del dispositivo. */
  purged: boolean;
  /** La sincronización en vuelo terminó antes de purgar (falso si se agotó la espera). */
  drained: boolean;
}

/**
 * Salida de una cuenta con barrera:
 * 1. `beginExit`: la sincronización no empieza ninguna operación nueva;
 * 2. se espera (con plazo) a la que está en vuelo, para no dejar un envío a medias sin registrar;
 * 3. `clearAccount` cierra la cuenta y borra sus datos: cualquier respuesta tardía ya no puede recrearlos;
 * 4. se revoca el token en el servidor y se olvida la sesión local aunque la revocación falle.
 * No deshace mutaciones ya confirmadas por el servidor. El resultado es explícito: sin red, la sesión local se
 * cierra igualmente pero `revoked` es falso; si la purga falla, `purge_failed` — nunca un cierre aparentemente limpio.
 */
export async function signOutAccount({
  accountId,
  client,
  storage,
  drainTimeoutMs,
}: {
  accountId: string;
  client: ReturnType<typeof createMobileClient>;
  storage: EncryptedStorage;
  drainTimeoutMs?: number;
}): Promise<SignOutResult> {
  storage.beginExit(accountId);
  const drained = await awaitActiveSync(storage, accountId, drainTimeoutMs);

  let purged = true;
  try {
    await storage.clearAccount(accountId);
  } catch {
    purged = false;
  }

  let revoked = true;
  try {
    await client.signOut();
  } catch (error) {
    // 401: el servidor ya no reconocía la sesión, que es lo que se buscaba.
    revoked = (error as { status?: number }).status === 401;
  }
  client.setToken(null);
  try {
    await storage.clearSession();
  } catch {
    purged = false;
  }

  const status: SignOutStatus = !purged ? "purge_failed" : revoked ? "signed_out" : "signed_out_unrevoked";
  return { status, revoked, purged, drained };
}

/** Estados que la persona aún no tiene resueltos en el servidor: todo menos `synced`. */
export function unresolvedOperations(queue: OfflineQueuedOperation[]): OfflineQueuedOperation[] {
  return queue.filter((op) => op.state !== "synced");
}

export type RequestSignOutResult =
  | { status: "cancelled"; unresolved: number }
  | (SignOutResult & { unresolved: number });

/**
 * Salida con aviso: si hay cambios sin sincronizar (pendientes, en envío, con conflicto, fallidos, caducados o
 * esperando acceso) pide confirmación antes de descartarlos. Cancelar no toca la sesión ni los cambios.
 * Con cero pendientes sale directamente. Un fallo al leer la cola se propaga: no se descarta a ciegas.
 */
export async function requestSignOut({
  accountId,
  client,
  storage,
  confirmDiscard,
  drainTimeoutMs,
}: {
  accountId: string;
  client: ReturnType<typeof createMobileClient>;
  storage: EncryptedStorage;
  confirmDiscard: (unresolved: number) => Promise<boolean>;
  drainTimeoutMs?: number;
}): Promise<RequestSignOutResult> {
  const unresolved = unresolvedOperations(await storage.getQueue(accountId)).length;
  if (unresolved > 0 && !(await confirmDiscard(unresolved))) return { status: "cancelled", unresolved };
  return { ...(await signOutAccount({ accountId, client, storage, drainTimeoutMs })), unresolved };
}
