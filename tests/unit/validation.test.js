import { describe, expect, it } from "vitest";
import {
  Attendee,
  CancelBooking,
  CancelEvent,
  ConfirmHold,
  ContactMessage,
  CreateCalendar,
  CreateEvent,
  CreateOrg,
  FullName,
  freeText,
  OtpVerify,
  Service,
  UpdateEvent,
} from "../../packages/schemas/dist/index.js";

describe("contratos de texto compartidos", () => {
  it.each(["Ana López Ruiz", "O’Connor", "李 小龍", "أحمد", "A", "Jean-Luc", "Dr. Sol 2", "Jose\u0301"])(
    "conserva nombres internacionales: %s",
    (name) => {
      expect(FullName.parse(`  ${name}  `)).toBe(name);
    },
  );
  it.each(["", "   ", "A".repeat(121), "A\nB", "A\u0000B", "A\u007fB", "A\u202eB", "<script>"])(
    "rechaza nombres inválidos: %j",
    (name) => {
      expect(FullName.safeParse(name).success).toBe(false);
    },
  );
  it("aplica los límites a todos los puntos de entrada de nombres", () => {
    const schemas = [
      FullName,
      Attendee.shape.name,
      CreateOrg.shape.name,
      CreateCalendar.shape.name,
      ConfirmHold.shape.name,
      OtpVerify.shape.name,
    ];
    for (const schema of schemas) {
      expect(schema.safeParse("Á".repeat(120)).success).toBe(true);
      expect(schema.safeParse("Á".repeat(121)).success).toBe(false);
    }
  });
  it.each([200, 500, 1000, 2000, 4000])("permite exactamente %i unidades de texto libre", (limit) => {
    expect(freeText(limit).safeParse("x".repeat(limit)).success).toBe(true);
    expect(freeText(limit).safeParse("x".repeat(limit + 1)).success).toBe(false);
    expect(freeText(limit).safeParse("🙂".repeat(limit / 2)).success).toBe(true);
    expect(freeText(limit).safeParse(`${"🙂".repeat(limit / 2)}x`).success).toBe(false);
  });
  it("permite saltos, tabuladores y puntuación como texto, rechaza controles", () => {
    expect(
      ContactMessage.safeParse({ name: "Ana", email: "ana@example.com", message: "Hola,\n\t¿Costo < 100?" })
        .success,
    ).toBe(true);
    for (const bad of ["\u0000", "\u000b", "\u0085", "\u2066"])
      expect(freeText(100).safeParse(`abc${bad}def`).success).toBe(false);
  });
  it("valida creación, edición y cancelación incluso en campos opcionales", () => {
    expect(
      CreateEvent.safeParse({
        kind: "block",
        start: "2026-10-20T10:00:00Z",
        end: "2026-10-20T11:00:00Z",
        title: "x".repeat(201),
      }).success,
    ).toBe(false);
    expect(UpdateEvent.safeParse({ internalNotes: "x".repeat(2001) }).success).toBe(false);
    for (const schema of [CancelBooking, CancelEvent]) {
      expect(schema.safeParse({ reason: "x".repeat(500) }).success).toBe(true);
      expect(schema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
    }
  });
  it("el servicio necesita un nombre y rechaza texto inválido en ambos idiomas", () => {
    expect(Service.safeParse({ name: { es: "Consulta" }, durationMin: 30 }).success).toBe(true);
    for (const name of [{}, { es: " " }, { es: "Consulta", en: "x".repeat(121) }])
      expect(Service.safeParse({ name, durationMin: 30 }).success).toBe(false);
  });

  it("valida campos de autenticación (longitud mínima, máxima y caracteres permitidos)", async () => {
    const { EmailField, PasswordField, NewPasswordField, SignInInput, SignUpInput } = await import(
      "../../packages/schemas/dist/index.js"
    );

    // Email: min 5, max 254, formato RFC
    expect(EmailField.safeParse("user@example.com").success).toBe(true);
    expect(EmailField.safeParse("a@b.co").success).toBe(true);
    expect(EmailField.safeParse("a@b").success).toBe(false); // < 5 caracteres y sin TLD válido
    expect(EmailField.safeParse("user@").success).toBe(false);
    expect(EmailField.safeParse("user@example").success).toBe(false);
    expect(EmailField.safeParse("   ").success).toBe(false);
    expect(EmailField.safeParse(`user@${"a".repeat(250)}.com`).success).toBe(false); // > 254

    // Password login: min 8, max 128, sin controles
    expect(PasswordField.safeParse("12345678").success).toBe(true);
    expect(PasswordField.safeParse("1234567").success).toBe(false); // < 8
    expect(PasswordField.safeParse("a".repeat(129)).success).toBe(false); // > 128
    expect(PasswordField.safeParse("pass\u0000word").success).toBe(false); // control

    // Password nuevo (registro/reset): min 12, max 128
    expect(NewPasswordField.safeParse("mi-contrasena-segura-12").success).toBe(true);
    expect(NewPasswordField.safeParse("corta-11car").success).toBe(false); // < 12
    expect(NewPasswordField.safeParse("a".repeat(129)).success).toBe(false);

    // Formulario de login
    expect(SignInInput.safeParse({ email: "test@domain.com", password: "password123" }).success).toBe(true);
    expect(SignInInput.safeParse({ email: "invalid", password: "password123" }).success).toBe(false);
    expect(SignInInput.safeParse({ email: "test@domain.com", password: "short" }).success).toBe(false);

    // Formulario de registro
    expect(
      SignUpInput.safeParse({
        name: "María Pérez",
        email: "maria@example.com",
        password: "contrasena-muy-segura-12",
      }).success,
    ).toBe(true);
    expect(
      SignUpInput.safeParse({
        name: "M", // < 2 caracteres
        email: "maria@example.com",
        password: "contrasena-muy-segura-12",
      }).success,
    ).toBe(false);
  });

  it("valida teléfono en formato internacional numérico E.164", async () => {
    const { Attendee } = await import("../../packages/schemas/dist/index.js");
    expect(Attendee.safeParse({ name: "Carlos", phone: "+34612345678" }).success).toBe(true);
    expect(Attendee.safeParse({ name: "Carlos", phone: "+15551234567" }).success).toBe(true);
    expect(Attendee.safeParse({ name: "Carlos", phone: "+5511987654321" }).success).toBe(true);
    expect(Attendee.safeParse({ name: "Carlos", phone: "letras-en-telefono" }).success).toBe(false);
    expect(Attendee.safeParse({ name: "Carlos", phone: "+0123" }).success).toBe(false); // < 7 dígitos
  });
});
