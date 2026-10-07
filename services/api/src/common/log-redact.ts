/** Parámetros de consulta que nunca deben quedar en los registros (tokens, códigos y firmas). */
const SENSITIVE = /^(token|code|sig|state|client_secret|password|otp|d|s)$/i;

/** URL sin los valores sensibles de la consulta: «/x?token=abc» → «/x?token=[oculto]». */
export function redactUrl(url: string): string {
  const q = url.indexOf("?");
  if (q === -1) return url;
  const params = new URLSearchParams(url.slice(q + 1));
  for (const key of [...params.keys()]) if (SENSITIVE.test(key)) params.set(key, "[oculto]");
  return `${url.slice(0, q)}?${params.toString()}`;
}

/** Serializador de peticiones de pino-http: método, URL sin secretos e id. */
export function requestSerializer(req: { id?: unknown; method?: string; url?: string }) {
  return { id: req.id, method: req.method, url: redactUrl(req.url ?? "") };
}
