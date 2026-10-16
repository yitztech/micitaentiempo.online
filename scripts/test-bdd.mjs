import { spawnSync } from "node:child_process";

// Las suites son secuenciales: @reloj cambia el reloj compartido del motor.
const VALID_PROJECTS = [
  "backend",
  "frontend",
  "escritorio",
  "android",
  "ios",
  "android-tablet",
  "ios-tablet",
];
const MOBILE_PROJECTS = ["android", "ios", "android-tablet", "ios-tablet"];
const args = process.argv.slice(2);
const projects = args.filter((arg) => VALID_PROJECTS.includes(arg));
if (!projects.length)
  throw new Error("Indica backend, frontend, escritorio, android, ios, android-tablet o ios-tablet");
const extra = args.filter((arg) => arg !== "--" && !projects.includes(arg));
if (process.env.CI && projects.some((p) => MOBILE_PROJECTS.includes(p))) {
  throw new Error("Las suites móviles se ejecutan exclusivamente en local");
}
function run(args, env = {}) {
  const result = spawnSync("pnpm", args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const url of [
  process.env.ES_URL ?? "http://micitaentiempo.localhost:8080",
  process.env.EN_URL ?? "http://myappointmentontime.localhost:8080",
]) {
  try {
    const response = await fetch(`${url}/api/healthz`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch {
    throw new Error(`Entorno no disponible en ${url}. Ejecuta pnpm test:env:up y espera a que termine.`);
  }
}
run(["build:packages"]);
run(["--filter", "@mcet/escenarios", "exec", "bddgen"]);
for (const project of projects) {
  run(["--filter", "@mcet/escenarios", "exec", "playwright", "test", "--project", project, ...extra], {
    INFORME: project,
  });
}
if (projects.some((p) => ["backend", "escritorio"].includes(p))) {
  run(
    [
      "--filter",
      "@mcet/escenarios",
      "exec",
      "playwright",
      "test",
      "--project",
      "reloj",
      "--pass-with-no-tests",
      ...extra,
    ],
    {
      INFORME: "reloj",
    },
  );
}
