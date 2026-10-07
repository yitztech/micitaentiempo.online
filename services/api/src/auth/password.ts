import { hash, verify } from "@node-rs/argon2";

// OWASP: Argon2id con m = 19 MiB, t = 2, p = 1.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
// Cada hash usa ~19 MiB: como mucho 4 a la vez para respetar mem_limit (384m).
const MAX_CONCURRENT = 4;
let running = 0;
const queue: Array<() => void> = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => queue.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

export function hashPassword(password: string): Promise<string> {
  return limited(() => hash(password, OPTIONS));
}

export function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  return limited(() => verify(data.hash, data.password).catch(() => false));
}
