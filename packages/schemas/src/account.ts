import { z } from "zod";
import { Country, Lang, TimeZone } from "./common.ts";
import { FullName, freeText, singleLine } from "./text.ts";

export { FullName } from "./text.ts";

/** Nombre completo en un solo campo (culturalmente flexible: dos apellidos, nombre único…). */

export const UpdateMe = z
  .object({
    name: FullName,
    locale: Lang,
    timezone: TimeZone,
    timeFormat: z.enum(["12h", "24h"]),
    weekStart: z.union([z.literal(1), z.literal(7)]),
    country: Country.nullable(),
  })
  .partial()
  .strict();
export type UpdateMe = z.infer<typeof UpdateMe>;

/** Formulario de contacto de las páginas públicas. */
export const ContactMessage = z
  .object({
    name: FullName,
    email: z.string().trim().min(3).max(254),
    message: freeText(4000).trim().min(10),
    newsletter: z.boolean().default(false),
  })
  .strict();
export type ContactMessage = z.infer<typeof ContactMessage>;

export const NewsletterSignup = z
  .object({ email: z.string().trim().min(3).max(254), name: singleLine(120).optional() })
  .strict();
export type NewsletterSignup = z.infer<typeof NewsletterSignup>;

/** Límites y caracteres de nombres de personas en el registro. */
export const AUTH_NAME_MAX = 100;
export const AUTH_NAME_PATTERN = /^[\p{L}\p{M}](?:[\p{L}\p{M} '’.-]*[\p{L}\p{M}.])?$/u;
export const AUTH_NAME_ALLOWED = /[^\p{L}\p{M} '’.-]/gu;
export const AuthName = z
  .string()
  .transform((value) => value.trim().replace(/ +/g, " "))
  .refine((value) => Array.from(value).length >= 1 && Array.from(value).length <= AUTH_NAME_MAX)
  .refine((value) => AUTH_NAME_PATTERN.test(value));

/** Validación estricta de correo electrónico: longitud mín 5, máx 254 y caracteres válidos RFC 5321/5322 */
export const EmailField = z
  .string()
  .trim()
  .min(5, "Mínimo 5 caracteres")
  .max(254, "Máximo 254 caracteres")
  .pipe(z.email("Formato de correo no válido"));

/** Validación de contraseña existente para inicio de sesión: mín 8, máx 128, sin caracteres de control */
export const PasswordField = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(128, "Máximo 128 caracteres")
  // biome-ignore lint/suspicious/noControlCharactersInRegex: validación explícita de caracteres de control
  .regex(/^[^\u0000-\u001f\u007f-\u009f]+$/, "Contraseña con caracteres no permitidos");

/** Validación de nueva contraseña (registro y restablecimiento): mín 12, máx 128 */
export const NewPasswordField = z
  .string()
  .min(12, "Mínimo 12 caracteres")
  .max(128, "Máximo 128 caracteres")
  // biome-ignore lint/suspicious/noControlCharactersInRegex: validación explícita de caracteres de control
  .regex(/^[^\u0000-\u001f\u007f-\u009f]+$/, "Contraseña con caracteres no permitidos");

/** Validación de teléfono: solo dígitos y caracteres numéricos/separadores, longitud válida */
export const PhoneField = z
  .string()
  .trim()
  .min(7, "Mínimo 7 caracteres")
  .max(20, "Máximo 20 caracteres")
  .regex(/^\+?[0-9\s\-()]{7,20}$/, "Solo se permiten números y caracteres telefónicos");
export type PhoneField = z.infer<typeof PhoneField>;

export const SignInInput = z
  .object({
    email: EmailField,
    password: PasswordField,
  })
  .passthrough();
export type SignInInput = z.infer<typeof SignInInput>;

export const SignUpInput = z
  .object({
    name: AuthName,
    email: EmailField,
    password: NewPasswordField,
  })
  .passthrough();
export type SignUpInput = z.infer<typeof SignUpInput>;

export const ForgotPasswordInput = z
  .object({
    email: EmailField,
  })
  .passthrough();
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInput>;

export const ResetPasswordInput = z
  .object({
    newPassword: NewPasswordField,
  })
  .passthrough();
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;
