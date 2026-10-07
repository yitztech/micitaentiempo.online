// Crea (si faltan) los productos y precios de Stripe por lookup_key. Idempotente.
//   STRIPE_SECRET_KEY=sk_test_… pnpm --filter @mcet/api stripe:setup
import Stripe from "stripe";
import { LOOKUP_KEYS } from "../billing/stripe.config.js";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Falta STRIPE_SECRET_KEY");
  process.exit(2);
}
const stripe = new Stripe(key);
const PLANS = [
  { lookup: LOOKUP_KEYS.personal, name: "Mi Cita en Tiempo · Personal", amount: 500 },
  { lookup: LOOKUP_KEYS.branches, name: "Mi Cita en Tiempo · Sucursales", amount: 2000 },
];
const existing = await stripe.prices.list({ lookup_keys: PLANS.map((p) => p.lookup), limit: 10 });
for (const p of PLANS) {
  if (existing.data.some((x) => x.lookup_key === p.lookup)) {
    console.log(`Ya existe ${p.lookup}`);
    continue;
  }
  const product = await stripe.products.create({ name: p.name, tax_code: "txcd_10103001" });
  await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: p.amount,
    recurring: { interval: "month" },
    lookup_key: p.lookup,
    tax_behavior: "exclusive",
  });
  console.log(`Creado ${p.lookup}`);
}
