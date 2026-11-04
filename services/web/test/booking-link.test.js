import { describe, expect, it } from "vitest";
import { bookingLinkTarget } from "../app/lib/booking-link.ts";

describe("Enlace corto de reserva /c/<slug>", () => {
  it("lleva a la reserva en el idioma del dominio", () => {
    expect(bookingLinkTarget("es", "consultas")).toBe("/reservar/consultas");
    expect(bookingLinkTarget("en", "consultas")).toBe("/book/consultas");
  });

  it("conserva la consulta y escapa el slug", () => {
    expect(bookingLinkTarget("es", "consultas", "?servicio=1")).toBe("/reservar/consultas?servicio=1");
    expect(bookingLinkTarget("es", "a/b")).toBe("/reservar/a%2Fb");
  });
});
