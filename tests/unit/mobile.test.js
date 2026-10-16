import { describe, expect, it } from "vitest";
import { MobileGoogleAuth, MobileSignIn, MobileSignUp } from "../../packages/schemas/dist/index.js";
import { validateRequest } from "../../services/web/app/lib/validation.ts";

describe("contratos de autenticación y endpoints móviles", () => {
  it("valida el registro móvil con las mismas reglas de nombre y contraseña que la web", () => {
    expect(
      MobileSignUp.parse({
        name: "  María José López  ",
        email: "maria@example.com",
        password: "una-clave-segura-2026",
      }),
    ).toEqual({
      name: "María José López",
      email: "maria@example.com",
      password: "una-clave-segura-2026",
    });

    for (const badName of ["", "   ", "A".repeat(121), "Ana\u202e", "<script>"]) {
      expect(
        MobileSignUp.safeParse({
          name: badName,
          email: "maria@example.com",
          password: "una-clave-segura-2026",
        }).success,
      ).toBe(false);
    }

    expect(
      MobileSignUp.safeParse({
        name: "María",
        email: "maria@example.com",
        password: "corta",
      }).success,
    ).toBe(false);
  });

  it("valida inicio de sesión móvil con correo y contraseña", () => {
    expect(
      MobileSignIn.safeParse({
        email: "laura@example.com",
        password: "una-clave-segura-2026",
      }).success,
    ).toBe(true);
    expect(MobileSignIn.safeParse({ email: "invalido", password: "123" }).success).toBe(false);
  });

  it("valida login con Google en móvil mediante código OAuth PKCE o idToken", () => {
    expect(
      MobileGoogleAuth.safeParse({
        code: "prueba:cliente-movil@example.com",
        redirectUri: "micitaentiempo://oauth/google",
        codeVerifier: "verificador-pkce-con-longitud-suficiente-1234567890",
      }).success,
    ).toBe(true);

    expect(
      MobileGoogleAuth.safeParse({
        idToken: "e30.eyJlbWFpbCI6ImFuYUBnbWFpbC5jb20ifQ.firma",
      }).success,
    ).toBe(true);

    // Rechaza si no se envía ni code ni idToken
    expect(MobileGoogleAuth.safeParse({}).success).toBe(false);
    // Rechaza redirectUri hacia dominios externos arbitrarios
    expect(
      MobileGoogleAuth.safeParse({
        code: "codigo-1234567890",
        redirectUri: "https://evil.example/callback",
      }).success,
    ).toBe(false);
  });

  it("aplica validación previa en el cliente para las rutas móviles", () => {
    expect(() =>
      validateRequest("POST", "/api/public/v1/mobile/auth/sign-up", {
        name: "<script>",
        email: "ana@example.com",
        password: "una-clave-segura-2026",
      }),
    ).toThrow();

    expect(() => validateRequest("POST", "/api/public/v1/mobile/auth/google", {})).toThrow();
  });
});
