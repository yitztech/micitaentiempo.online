import { promises as dns } from "node:dns";
import { domainToASCII } from "node:url";
import MailChecker from "mailchecker";
import { z } from "zod";

export type EmailProblem = "invalid_format" | "no_mail_server" | "disposable";

export interface EmailCheck {
  ok: boolean;
  normalized: string;
  problem?: EmailProblem;
}

const syntax = z.email();

/** Normaliza: recorta, Unicode NFC, dominio en minúsculas y en punycode. */
export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim().normalize("NFC");
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return trimmed.toLowerCase();
  const local = trimmed.slice(0, at);
  const domain = domainToASCII(trimmed.slice(at + 1).toLowerCase()) || trimmed.slice(at + 1).toLowerCase();
  return `${local}@${domain}`.toLowerCase();
}

/** Lo mínimo de node:dns que hace falta (inyectable en pruebas). */
export interface Resolver {
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolve4(domain: string): Promise<unknown[]>;
  resolve6(domain: string): Promise<unknown[]>;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { ok: boolean; at: number }>();
const CACHE_MS = 60 * 60 * 1000;

/** ¿El dominio acepta correo? MX (salvo MX nulo, RFC 7505) o, sin MX, A/AAAA (RFC 5321). */
export async function domainAcceptsMail(domain: string, resolver: Resolver = dns): Promise<boolean> {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  let ok = false;
  try {
    const mx = await withTimeout(resolver.resolveMx(domain), 2000);
    ok = mx.length > 0 && !(mx.length === 1 && (mx[0]?.exchange === "" || mx[0]?.exchange === "."));
  } catch {
    try {
      const a: unknown[] = await withTimeout(resolver.resolve4(domain), 2000).catch(() => []);
      const aaaa: unknown[] = a.length
        ? []
        : await withTimeout(resolver.resolve6(domain), 2000).catch(() => []);
      ok = a.length > 0 || aaaa.length > 0;
    } catch {
      ok = false;
    }
  }
  cache.set(domain, { ok, at: Date.now() });
  return ok;
}

/**
 * Valida un correo antes de crear la cuenta (RF-02): formato, dominio con servidor de correo
 * y dominio no desechable. La verificación por enlace o código la hace Better Auth después.
 * `skipDns` solo se usa con TEST_MODE (los dominios de prueba no tienen DNS).
 */
export async function checkEmail(
  raw: string,
  opts: { skipDns?: boolean; resolver?: Resolver } = {},
): Promise<EmailCheck> {
  const normalized = normalizeEmail(raw);
  const [local = "", domain = ""] = [
    normalized.slice(0, normalized.lastIndexOf("@")),
    normalized.split("@").pop(),
  ];
  if (normalized.length > 254 || local.length > 64 || !syntax.safeParse(normalized).success) {
    return { ok: false, normalized, problem: "invalid_format" };
  }
  if (!MailChecker.isValid(normalized)) return { ok: false, normalized, problem: "disposable" };
  if (!opts.skipDns && !(await domainAcceptsMail(domain, opts.resolver))) {
    return { ok: false, normalized, problem: "no_mail_server" };
  }
  return { ok: true, normalized };
}
