import { describe, expect, it } from "vitest";
import { identityOf } from "../src/public-booking/google-customer.js";

const jwt = (p: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(p)).toString("base64url")}.firma`;
const base = {
  email: "Ana@Gmail.com",
  email_verified: true,
  aud: "cliente",
  iss: "https://accounts.google.com",
  name: "Ana",
};

describe("«Continuar con Google» del cliente final", () => {
  it("acepta un id_token de Google con correo verificado y nuestra audiencia", () => {
    expect(identityOf(jwt(base), "cliente", false)).toEqual({ email: "ana@gmail.com", name: "Ana" });
  });

  it("rechaza correo sin verificar, otra audiencia u otro emisor", () => {
    expect(identityOf(jwt({ ...base, email_verified: false }), "cliente", false)).toBeNull();
    expect(identityOf(jwt({ ...base, aud: "otro" }), "cliente", false)).toBeNull();
    expect(identityOf(jwt({ ...base, iss: "https://evil.example" }), "cliente", false)).toBeNull();
    expect(identityOf("basura", "cliente", false)).toBeNull();
    expect(identityOf(undefined, "cliente", false)).toBeNull();
  });
});
