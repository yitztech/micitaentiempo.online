export type Tab = "stats" | "users" | "subscriptions" | "blocked" | "audit";
export type UserFilter = "all" | "verified" | "blocked";

export interface AdminUser {
  id: string;
  username: string;
}

export interface LoginResponse {
  token: string;
  user: AdminUser;
}

export interface Stats {
  totalUsers?: number;
  verifiedUsers?: number;
  activeSubscriptions?: number;
  trialSubscriptions?: number;
  canceledSubscriptions?: number;
  pastDueSubscriptions?: number;
  totalAppointments?: number;
  mrrEstimate?: number;
  blockedUsers?: number;
  personalPlans?: number;
  branchesPlans?: number;
  newUsers7d?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  org_name: string | null;
  org_plan: string | null;
  org_status: string | null;
  org_cancel_at_period_end: boolean;
  is_blocked: boolean;
}

export interface Subscription {
  org_name: string;
  owner_name: string;
  owner_email: string;
  plan: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

export interface SubscriptionSummary {
  totalSubscriptions: number;
  totalCanceled: number;
  churnRatePercent: number;
}

export interface BlockedUser {
  user_id: string;
  email: string;
  reason: string;
  blocked_at: string;
  blocked_by: string;
}

export interface AuditLog {
  created_at: string;
  action: string;
  admin_user: string;
  target_id: string;
  details: string;
}
