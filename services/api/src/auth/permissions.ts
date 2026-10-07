/**
 * Matriz de permisos (docs/plan/01-requisitos.md §1.6). Única fuente para guardas, MCP y pruebas.
 */
export type CalendarRole = "owner" | "editor" | "observer" | "customer";

export const ACTIONS = {
  "slots.read": ["owner", "editor", "observer", "customer"],
  "events.read_all": ["owner", "editor", "observer"],
  "events.read_own": ["owner", "editor", "observer", "customer"],
  "events.write": ["owner", "editor"],
  "events.recurring": ["owner", "editor"],
  "blocks.write": ["owner", "editor"],
  "bookings.create_for_customer": ["owner", "editor"],
  "bookings.create_own": ["customer"],
  "bookings.manage_any": ["owner", "editor"],
  "bookings.manage_own": ["customer"],
  "settings.write": ["owner"],
  "members.manage": ["owner"],
  "integrations.calendar": ["owner"],
  "feeds.personal": ["owner", "editor", "observer", "customer"],
  "billing.manage": ["owner"],
  "stats.read": ["owner", "editor"],
} as const satisfies Record<string, readonly CalendarRole[]>;

export type Action = keyof typeof ACTIONS;

export function can(role: CalendarRole | undefined, action: Action): boolean {
  return role !== undefined && (ACTIONS[action] as readonly CalendarRole[]).includes(role);
}
