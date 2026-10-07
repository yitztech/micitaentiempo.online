// Tras configurar Stripe: fija el fin de prueba de las organizaciones en prueba y les avisa.
//   pnpm --filter @mcet/api billing:activate [días=30]
import { BillingService } from "../billing/billing.service.js";
import { appContext } from "./context.js";

const days = Number(process.argv[2] ?? 30);
const app = await appContext();
const billing = app.get(BillingService);
if (!billing.config.enabled) {
  console.error(
    "Stripe no está configurado: define STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET y STRIPE_PUBLISHABLE_KEY.",
  );
  process.exit(1);
}
const n = await billing.activate(days);
console.log(`${n} organizaciones en prueba: terminan en ${days} días y recibieron aviso.`);
await app.close();
