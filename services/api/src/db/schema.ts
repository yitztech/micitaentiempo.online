import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const app = pgSchema("app");

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Datos de la instalación (versión del esquema, fecha de alta…). */
export const systemInfo = app.table("system_info", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Eventos de dominio recibidos del motor; event_id único garantiza idempotencia (ADR 0004). */
export const inboundEvents = app.table(
  "inbound_events",
  {
    eventId: text("event_id").primaryKey(),
    type: text("type").notNull(),
    orgId: text("org_id"),
    calendarId: text("calendar_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    version: integer("version").notNull().default(1),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("inbound_events_pending").on(t.receivedAt).where(sql`processed_at is null`)],
);

// ── Better Auth (las claves del objeto son los modelos que espera el adaptador) ──

export const user = app.table("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  locale: text("locale").default("es"),
  timezone: text("timezone").default("UTC"),
  timeFormat: text("time_format").default("24h"),
  weekStart: integer("week_start").default(1),
  country: text("country"),
});

export const session = app.table(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

export const account = app.table(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("accounts_user").on(t.userId),
    uniqueIndex("accounts_provider").on(t.providerId, t.accountId),
  ],
);

export const verification = app.table(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier").on(t.identifier)],
);

export const twoFactor = app.table("two_factors", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  verified: boolean("verified").default(false),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

export const rateLimit = app.table("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ── Negocio ──

/** Organización (negocio) con su plan y estado (docs/plan/05-negocio-api.md §5.5). */
export const organizations = app.table(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    plan: text("plan", { enum: ["personal", "branches"] }).notNull(),
    status: text("status", { enum: ["trialing", "active", "past_due", "read_only", "suspended"] })
      .notNull()
      .default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    country: text("country"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("organizations_owner").on(t.ownerUserId).where(sql`deleted_at is null`)],
);

/** Miembros por tablero: propietario, editor u observador (01-requisitos.md §1.6). */
export const calendarMembers = app.table(
  "calendar_members",
  {
    calendarId: text("calendar_id").notNull(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "editor", "observer"] }).notNull(),
    notify: boolean("notify").notNull(),
    addedBy: text("added_by"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.calendarId, t.userId] }), index("calendar_members_user").on(t.userId)],
);

/** Invitaciones de editores (solo Google) y observadores. */
export const invitations = app.table(
  "invitations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: ["editor", "observer"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    requiresGoogle: boolean("requires_google").notNull(),
    invitedBy: text("invited_by").notNull(),
    lang: text("lang").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_calendar").on(t.calendarId)],
);

/** Clientes finales de cada negocio. */
export const customerLinks = app.table(
  "customer_links",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    firstBookingAt: timestamp("first_booking_at", { withTimezone: true }).notNull().defaultNow(),
    lastBookingAt: timestamp("last_booking_at", { withTimezone: true }).notNull().defaultNow(),
    locale: text("locale").notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

/** Auditoría de acciones sensibles (cambios de rol, conexiones, facturación, MCP). */
export const auditLog = app.table(
  "audit_log",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id"),
    actorUserId: text("actor_user_id"),
    via: text("via", { enum: ["panel", "public", "mcp", "system"] }).notNull(),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata"),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_org").on(t.orgId, t.createdAt)],
);
