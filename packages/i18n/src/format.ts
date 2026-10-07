/** Sustituye {{variables}} en un texto del catálogo. */
export function interpolate(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? `{{${key}}}` : String(value);
  });
}
