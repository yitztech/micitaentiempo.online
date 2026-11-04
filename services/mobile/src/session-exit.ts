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

type MobileClient = ReturnType<typeof createMobileClient>;

export type SessionRefresh =
  /** No hay sesión guardada. */
  | { status: "none" }
  /** La sesión guardada sigue vigente y sus datos están al día. */
  | {
      status: "refreshed";
      summary: Awaited<ReturnType<MobileClient["panelSummary"]>>;
      bookings: Awaited<ReturnType<MobileClient["myBookings"]>>;
    }
  /** El servidor rechazó la sesión: se olvidó. */
  | { status: "invalidated" }
  /** La cuenta salió, entró otra sesión o se canceló mientras tanto: el resultado se descarta sin tocar nada. */
  | { status: "stale" };

/**
 * Restaura la sesión guardada y refresca sus datos. Una comprobación en vuelo nunca devuelve el token ni los datos de
 * una cuenta que está saliendo, ni pisa una sesión más reciente. 401/403 invalidan la sesión; cualquier otro fallo
 * (red, 5xx) se propaga para que quien llama lo trate como comprobación fallida.
 */
export async function refreshCachedSession({
  client,
  storage,
  isCancelled = () => false,
}: {
  client: MobileClient;
  storage: EncryptedStorage;
  isCancelled?: () => boolean;
}): Promise<SessionRefresh> {
  const cached = await storage.loadSession();
  if (!cached) return { status: "none" };
  const { token, user } = cached.session;
  const leaving = () => isCancelled() || storage.accountState(user.id) !== "open";
  const active = client.getToken();
  if (leaving() || (active && active !== token)) return { status: "stale" };
  client.setToken(token);
  const stale = () => leaving() || client.getToken() !== token;
  try {
    const [summary, bookings] = await Promise.all([client.panelSummary(), client.myBookings(false)]);
    if (stale()) return { status: "stale" };
    if (summary.user.id !== user.id) throw new Error("Account mismatch");
    await storage.saveSession({ token, user: summary.user });
    await storage.saveBookings(summary.user.id, bookings);
    await storage.saveSummary(summary.user.id, summary);
    return stale() ? { status: "stale" } : { status: "refreshed", summary, bookings };
  } catch (error: unknown) {
    if (stale()) return { status: "stale" };
    const status = (error as { status?: number }).status;
    if (status !== 401 && status !== 403) throw error;
    if (status === 403) await storage.clearAccount(user.id);
    await storage.clearSession();
    client.setToken(null);
    return { status: "invalidated" };
  }
}
