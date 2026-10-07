import { describe, expect, it } from "vitest";
import { ACTIONS, type Action, type CalendarRole, can } from "../src/auth/permissions.js";

// Expectativas copiadas de la tabla de 01-requisitos.md §1.6: si alguien cambia la matriz, esta prueba lo delata.
const EXPECTED: Record<Action, CalendarRole[]> = {
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
};

const ROLES: CalendarRole[] = ["owner", "editor", "observer", "customer"];

describe("matriz de permisos", () => {
  for (const action of Object.keys(ACTIONS) as Action[]) {
    for (const role of ROLES) {
      const allowed = EXPECTED[action].includes(role);
      it(`${role} ${allowed ? "puede" : "no puede"} ${action}`, () => {
        expect(can(role, action)).toBe(allowed);
      });
    }
  }
  it("sin rol no se permite nada", () => {
    expect(can(undefined, "slots.read")).toBe(false);
  });
  it("los clientes finales nunca crean series ni ven reservaciones ajenas (RF-10, RF-12)", () => {
    expect(can("customer", "events.recurring")).toBe(false);
    expect(can("customer", "events.read_all")).toBe(false);
  });
});
