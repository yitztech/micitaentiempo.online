import { z } from "zod";
import { MULTI_LINE, SINGLE_LINE, TEXT_LIMITS } from "./text-policy.ts";

export * from "./text-policy.ts";

/** Unicode, espacios y puntuación: no impone un alfabeto ni separa apellidos. */
export const singleLine = (max: number) =>
  z
    .string()
    .regex(SINGLE_LINE, "Texto de una sola línea sin controles ni etiquetas")
    .trim()
    .max(max)
    .refine((value) => value.length <= max, `Máximo ${max} unidades UTF-16`);
export const freeText = (max: number) =>
  z
    .string()
    .regex(MULTI_LINE, "Texto sin caracteres de control")
    .max(max)
    .refine((value) => value.length <= max, `Máximo ${max} unidades UTF-16`);
export const FullName = singleLine(TEXT_LIMITS.name).min(1);
export const Label = singleLine(TEXT_LIMITS.name).min(1);
