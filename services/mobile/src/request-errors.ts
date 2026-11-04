/** Error que lanza el cliente. `status` 0 = no hubo respuesta HTTP (red, DNS, plazo o cancelación). */
export interface MobileRequestError {
  status: number;
  code: string;
  body: Record<string, unknown>;
}

const UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

/**
 * ¿La petición no llegó a un servidor que pueda responder? Cubre red caída, DNS, plazo vencido y los 502/503/504
 * del gateway con la API caída. Un 401, 403, 409 o 422 son respuestas del servidor: nunca cuentan como falta de red.
 * Una cancelación pedida por quien llama (`aborted`) tampoco lo es.
 */
export function isTransportError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { status, code } = error as Partial<MobileRequestError>;
  if (code === "aborted") return false;
  return status === 0 || (typeof status === "number" && UNAVAILABLE_STATUSES.has(status));
}
