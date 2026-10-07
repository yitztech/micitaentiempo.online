/**
 * Consulta OAuth firmada por el servidor de autorización (Better Auth): cuando el flujo de una
 * aplicación de IA pasa por la entrada o el consentimiento, se reenvía tal cual para continuarlo.
 * Equivale a buildSignedOAuthQuery de @better-auth/oauth-provider (solo los parámetros firmados).
 */
export function signedOAuthQuery(search: string): string | undefined {
  const params = new URLSearchParams(search);
  if (!params.has("sig")) return undefined;
  const signed = new Set(params.getAll("ba_param"));
  if (!signed.size) return undefined;
  const out = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === "sig" || key === "ba_param" || signed.has(key)) out.append(key, value);
  }
  return out.toString();
}

/** Respuesta de Better Auth cuando el flujo OAuth sigue en otra URL. */
export interface OAuthRedirect {
  redirect?: boolean;
  url?: string;
  redirect_uri?: string;
}

export const oauthNext = (r: OAuthRedirect | null | undefined) => r?.url ?? r?.redirect_uri;
