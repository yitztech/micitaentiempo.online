/** Reenvía por separado las cookies renovadas durante las cargas paralelas de una petición. */
export async function forwardRefreshedCookies(cookies: string[], next: () => Promise<Response>) {
  const response = await next();
  for (const cookie of new Set(cookies)) response.headers.append("Set-Cookie", cookie);
  return response;
}
