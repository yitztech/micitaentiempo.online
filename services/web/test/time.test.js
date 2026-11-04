import { describe, expect, it } from "vitest";
import { allTimeZones } from "../app/lib/time.ts";

describe("Opciones del selector de zona horaria", () => {
  it("incluye UTC, el valor predeterminado de las cuentas, aunque Intl no lo liste", () => {
    expect(Intl.supportedValuesOf("timeZone")).not.toContain("UTC");
    expect(allTimeZones()).toContain("UTC");
  });

  it("conserva una zona guardada que Intl no lista", () => {
    expect(allTimeZones("Etc/GMT+5")).toContain("Etc/GMT+5");
  });

  it("no repite zonas", () => {
    const zones = allTimeZones("America/Mexico_City");
    expect(new Set(zones).size).toBe(zones.length);
  });
});
