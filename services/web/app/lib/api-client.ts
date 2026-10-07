/** Respuesta de error de `api` (problem+json) o de Better Auth ({ code, message }). */
export interface ApiError {
  status: number;
  code: string;
}

/** POST JSON al mismo origen; devuelve el cuerpo o lanza ApiError con el código en minúsculas. */
export async function postJson<T = unknown>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw { status: 0, code: "network" } satisfies ApiError;
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const code =
      typeof json.code === "string"
        ? json.code.toLowerCase()
        : res.status === 429
          ? "too_many_requests"
          : "generic";
    throw { status: res.status, code } satisfies ApiError;
  }
  return json as T;
}

/** Texto del error en el catálogo; los códigos de Better Auth se agrupan con su equivalente. */
export function errorText(errors: Record<string, string>, err: unknown): string {
  const e = err as Partial<ApiError>;
  let code = e?.code ?? "generic";
  if (code.startsWith("user_already_exists")) code = "user_already_exists";
  if (code === "invalid_password" || code === "invalid_email") code = "invalid_email_or_password";
  if (code === "rate_limited" || e?.status === 429) code = "too_many_requests";
  return errors[code] ?? errors.generic ?? "";
}

/** Solo rutas relativas propias para volver tras entrar (07-frontend.md §7.10). */
export function safeNext(next: string | null, fallback: string): string {
  return next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
