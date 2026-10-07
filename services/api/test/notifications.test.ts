import { describe, expect, it } from "vitest";
import { open, seal, sign, verify } from "../src/common/crypto.js";
import { groupOf } from "../src/notifications/groups.js";
import { customerText, staffText } from "../src/notifications/render.js";

const KEY = "k".repeat(40);

describe("secretos de canales", () => {
  it("cifra y descifra; con otra clave falla", () => {
    const s = seal(KEY, { webhookUrl: "https://hooks.slack.com/x" });
    expect(s).not.toContain("hooks.slack");
    expect(open<{ webhookUrl: string }>(KEY, s).webhookUrl).toBe("https://hooks.slack.com/x");
    expect(() => open(`${KEY}x`, s)).toThrow();
  });

  it("la firma de baja no se puede reutilizar para otro usuario o grupo", () => {
    const sig = sign(KEY, "u1.bookings.email");
    expect(verify(KEY, "u1.bookings.email", sig)).toBe(true);
    expect(verify(KEY, "u2.bookings.email", sig)).toBe(false);
    expect(verify(KEY, "u1.changes.email", sig)).toBe(false);
  });
});

describe("grupos y textos de avisos", () => {
  it("clasifica los eventos", () => {
    expect(groupOf("booking.created")).toBe("bookings");
    expect(groupOf("booking.cancelled")).toBe("changes");
    expect(groupOf("series.updated")).toBe("changes");
    expect(groupOf("reminder")).toBe("reminders");
    expect(groupOf("calendar.updated")).toBeNull();
  });

  it("escribe cada aviso en el idioma y la zona del destinatario", () => {
    const p = {
      type: "booking.created",
      calendar: "Consultas",
      customer: "Carla",
      service: "Corte",
      start: "2026-09-15T16:00:00Z",
    };
    expect(staffText("es", p, "America/Mexico_City")).toBe(
      "Carla reservó Corte para el martes, 15 de septiembre, 10:00 a.m. en «Consultas».",
    );
    expect(staffText("en", p, "America/New_York")).toBe(
      "Carla booked Corte for Tuesday, September 15 at 12:00 PM at “Consultas”.",
    );
    expect(customerText("es", { ...p, type: "reminder" }, "America/Mexico_City").subject).toBe(
      "Recordatorio de tu cita: martes, 15 de septiembre, 10:00 a.m.",
    );
  });
});
