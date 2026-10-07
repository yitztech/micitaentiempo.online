// Operación sin Stripe: cambia plan o estado de una organización a mano.
//   pnpm --filter @mcet/api org:set-plan <org_id> personal|branches [trialing|active|read_only|suspended]
import { eq } from "drizzle-orm";
import { BillingService, type OrgStatus } from "../billing/billing.service.js";
import { type Database, DB } from "../db/db.module.js";
import { organizations } from "../db/schema.js";
import { appContext } from "./context.js";

const [orgId, plan, status] = process.argv.slice(2);
if (!orgId || (plan !== "personal" && plan !== "branches")) {
  console.error("Uso: org:set-plan <org_id> personal|branches [trialing|active|read_only|suspended]");
  process.exit(2);
}
const app = await appContext();
const db = app.get<Database>(DB);
const [org] = await db.update(organizations).set({ plan }).where(eq(organizations.id, orgId)).returning();
if (!org) {
  console.error(`No existe la organización ${orgId}`);
  process.exit(1);
}
if (status) await app.get(BillingService).setStatus(org, status as OrgStatus);
console.log(`Organización ${orgId}: plan ${plan}${status ? `, estado ${status}` : ""}`);
await app.close();
