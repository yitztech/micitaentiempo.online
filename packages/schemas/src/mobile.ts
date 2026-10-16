import { z } from "zod";
import { FullName } from "./text.ts";

const MOBILE_REDIRECT_RE =
  /^(postmessage|(?:micitaentiempo|myappointmentontime|exp):\/\/[^\s]+|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/[^\s]*)$/;

export const MobileSignUp = z
  .object({
    name: FullName,
    email: z.email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();
export type MobileSignUp = z.infer<typeof MobileSignUp>;

export const MobileSignIn = z
  .object({
    email: z.email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();
export type MobileSignIn = z.infer<typeof MobileSignIn>;

export const MobileGoogleAuth = z
  .object({
    code: z.string().min(6).max(2048).optional(),
    redirectUri: z
      .string()
      .max(512)
      .refine((v) => MOBILE_REDIRECT_RE.test(v), "redirect_uri no permitido")
      .optional(),
    codeVerifier: z.string().min(10).max(256).optional(),
    idToken: z.string().min(10).max(8192).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.code || v.idToken), {
    message: "Se requiere code o idToken",
  });
export type MobileGoogleAuth = z.infer<typeof MobileGoogleAuth>;
