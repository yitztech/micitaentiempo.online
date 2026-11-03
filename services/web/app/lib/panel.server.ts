import { pathFor } from "@mcet/i18n";
import type { RouterContextProvider } from "react-router";
import { data, redirect } from "react-router";
import { type ApiResponse, apiGet } from "./api.server";
import { refreshedCookiesContext, siteContext } from "./context";

/**
 * GET a `api` con la sesión del usuario. Sin sesión → a «Entrar» con regreso; 404/403 → 404 (no se
 * revela qué existe). Devuelve los datos y las cookies renovadas (si las hay).
 */
export async function panelGet<T>(
  request: Request,
  context: Readonly<RouterContextProvider>,
  path: string,
): Promise<{ data: T; cookies: string[] }> {
  const res = await apiGet<T>(request, path, context.get(refreshedCookiesContext));
  return resolvePanelResponse(request, context, res);
}

function resolvePanelResponse<T>(
  request: Request,
  context: Readonly<RouterContextProvider>,
  res: ApiResponse<T>,
) {
  if (res.status === 401) {
    const { lang } = context.get(siteContext);
    const url = new URL(request.url);
    throw redirect(`${pathFor("signIn", lang)}?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (res.status === 403 && (res.body as { code?: string } | null)?.code === "email_not_verified") {
    throw redirect(pathFor("verifyEmail", context.get(siteContext).lang));
  }
  if (res.status === 404 || res.status === 403) throw data(null, { status: 404, statusText: "Not Found" });
  if (res.status >= 400 || res.body === null) throw data(null, { status: 502, statusText: "Bad Gateway" });
  return { data: res.body, cookies: context.get(refreshedCookiesContext) };
}

/** Igual que panelGet, pero un 404 devuelve null (p. ej., /org de quien no es propietario). */
export async function panelGetOptional<T>(
  request: Request,
  context: Readonly<RouterContextProvider>,
  path: string,
): Promise<{ data: T | null; cookies: string[] }> {
  const cookies = context.get(refreshedCookiesContext);
  const res = await apiGet<T>(request, path, cookies);
  if (res.status === 404) return { data: null, cookies };
  return resolvePanelResponse(request, context, res);
}
