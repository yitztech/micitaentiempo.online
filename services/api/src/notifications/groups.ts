/** Grupos de aviso de las preferencias (05-negocio-api.md §5.6). */
export const GROUPS = ["bookings", "changes", "reminders", "billing", "system"] as const;
export type Group = (typeof GROUPS)[number];

export const CHANNELS = ["email", "telegram", "slack", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Grupo de cada tipo de evento de dominio; null = no se avisa. */
export function groupOf(type: string): Group | null {
  if (type === "booking.created") return "bookings";
  if (type.startsWith("booking.") || type.startsWith("event.") || type.startsWith("series."))
    return "changes";
  if (type === "reminder") return "reminders";
  if (type.startsWith("billing.")) return "billing";
  if (type.startsWith("channel.")) return "system";
  return null;
}

/** Tipos que el cliente final recibe por correo aunque no tenga preferencias (son transaccionales). */
export const CUSTOMER_ESSENTIAL = new Set(["booking.created", "booking.cancelled", "booking.rescheduled"]);
