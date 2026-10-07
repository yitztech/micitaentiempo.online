import { describe, expect, it } from "vitest";
import { checkEmail, domainAcceptsMail, normalizeEmail } from "../src/security/email-validation.js";

const resolver = (mx: Record<string, string[]>, a: Record<string, string[]> = {}) => ({
  resolveMx: async (d: string) => {
    if (!(d in mx)) throw new Error("ENOTFOUND");
    return (mx[d] ?? []).map((exchange, priority) => ({ exchange, priority }));
  },
  resolve4: async (d: string) => {
    if (!(d in a)) throw new Error("ENOTFOUND");
    return a[d] ?? [];
  },
  resolve6: async () => [] as string[],
});

describe("validación de correo", () => {
  it("normaliza mayúsculas, espacios y dominios internacionales", () => {
    expect(normalizeEmail("  Ana@Ejemplo.COM ")).toBe("ana@ejemplo.com");
    expect(normalizeEmail("ana@españa.es")).toBe("ana@xn--espaa-rta.es");
  });

  it("rechaza formatos inválidos", async () => {
    for (const bad of ["ana", "ana@", "@x.com", "ana@@x.com", `${"a".repeat(65)}@x.com`]) {
      expect((await checkEmail(bad, { skipDns: true })).problem).toBe("invalid_format");
    }
  });

  it("rechaza dominios desechables", async () => {
    expect((await checkEmail("alguien@mailinator.com", { skipDns: true })).problem).toBe("disposable");
  });

  it("exige que el dominio reciba correo", async () => {
    const r = resolver(
      { "con-mx.mx": ["mx.con-mx.mx"], "mx-nulo.com": ["."] },
      { "solo-a.com": ["1.2.3.4"] },
    );
    expect((await checkEmail("a@con-mx.mx", { resolver: r })).ok).toBe(true);
    expect((await checkEmail("a@solo-a.com", { resolver: r })).ok).toBe(true);
    expect((await checkEmail("a@mx-nulo.com", { resolver: r })).problem).toBe("no_mail_server");
    expect(await domainAcceptsMail("no-existe.invalid", r)).toBe(false);
  });
});
