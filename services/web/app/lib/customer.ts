import { type ApiError, apiRequest } from "./api-client";

/**
 * Sesión del cliente final: token Bearer en memoria y en sessionStorage (particionado en el iframe del
 * embed; nunca en localStorage). Fuera del embed también sirve la cookie del dominio.
 */
const KEY = "mcet.customer";
let memory: { token: string; email: string } | null = null;

export function customerSession(): { token: string; email: string } | null {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as { token: string; email: string }) : null;
  } catch {
    memory = null;
  }
  return memory;
}

export function setCustomerSession(s: { token: string; email: string } | null): void {
  memory = s;
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    // sin almacenamiento: queda en memoria
  }
}

/** Petición del cliente final con su token (si lo hay). Un 401 borra la sesión guardada. */
export async function customerRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const s = customerSession();
  try {
    return await apiRequest<T>(method, path, body, s ? { authorization: `Bearer ${s.token}` } : {});
  } catch (err) {
    if ((err as ApiError).status === 401) setCustomerSession(null);
    throw err;
  }
}

/** Descarga el .ics de una cita (necesita el token, así que no basta un enlace). */
export async function downloadIcs(bookingId: string): Promise<void> {
  const s = customerSession();
  const res = await fetch(`/api/public/v1/my/bookings/${bookingId}/ics`, {
    headers: s ? { authorization: `Bearer ${s.token}` } : {},
    credentials: "same-origin",
  });
  if (!res.ok) return;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "cita.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
