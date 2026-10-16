/** Límites de producto en unidades UTF-16, igual que maxlength del navegador. */
export const TEXT_LIMITS = {
  name: 120,
  title: 200,
  address: 240,
  reason: 500,
  notes: 1000,
  internalNotes: 2000,
  message: 4000,
} as const;
// No controles C0/C1 ni controles bidi invisibles; el texto libre admite tabulador y saltos de línea.
// biome-ignore lint/suspicious/noControlCharactersInRegex: se excluyen controles deliberadamente
export const SINGLE_LINE = /^[^\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]*$/u;
export const MULTI_LINE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: se excluyen controles salvo tabulador y saltos de línea
  /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]*$/u;
