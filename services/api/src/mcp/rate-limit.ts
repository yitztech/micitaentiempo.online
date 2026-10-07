/** Ventana fija por minuto en memoria (una sola instancia de `api`). */
export class MinuteLimiter {
  private window = 0;
  private counts = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Cuenta una llamada para cada clave; false si alguna supera su límite (y no cuenta ninguna). */
  take(keys: { key: string; limit: number }[]): boolean {
    const w = Math.floor(this.now() / 60_000);
    if (w !== this.window) {
      this.window = w;
      this.counts.clear();
    }
    if (keys.some(({ key, limit }) => (this.counts.get(key) ?? 0) >= limit)) return false;
    for (const { key } of keys) this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    return true;
  }
}

/** Límites de MCP (docs/plan/06-mcp.md §6.4): por token y por organización. */
export const MCP_LIMITS = { perToken: 120, perOrg: 600 } as const;
