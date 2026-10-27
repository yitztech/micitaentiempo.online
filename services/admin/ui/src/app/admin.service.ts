import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type {
  AdminUser,
  AuditLog,
  BlockedUser,
  LoginResponse,
  Stats,
  Subscription,
  SubscriptionSummary,
  User,
  UserFilter,
} from "./models";

interface UsersResponse {
  users?: User[];
}

interface SubscriptionsResponse {
  subscriptions?: Subscription[];
  cancellations?: Subscription[];
  summary?: SubscriptionSummary;
}

interface BlockedResponse {
  blocked?: BlockedUser[];
}

interface AuditResponse {
  logs?: AuditLog[];
}

@Injectable({ providedIn: "root" })
export class AdminService {
  private readonly http = inject(HttpClient);

  login(username: string, password: string) {
    return this.http.post<LoginResponse>("/api/auth/login", { username, password });
  }

  logout() {
    return this.http.post<{ ok: boolean }>("/api/auth/logout", {});
  }

  getMe() {
    return this.http.get<{ user: AdminUser }>("/api/auth/me");
  }

  getStats() {
    return this.http.get<Stats>("/api/stats");
  }

  getUsers(search: string, filter: UserFilter) {
    let params = new HttpParams();
    if (search) params = params.set("q", search);
    if (filter !== "all") params = params.set("filter", filter);
    return this.http.get<UsersResponse>("/api/users", { params });
  }

  blockUser(userId: string, email: string, reason: string) {
    return this.http.post(`/api/users/${encodeURIComponent(userId)}/block`, { email, reason });
  }

  unblockUser(userId: string) {
    return this.http.post(`/api/users/${encodeURIComponent(userId)}/unblock`, {});
  }

  getSubscriptions() {
    return this.http.get<SubscriptionsResponse>("/api/subscriptions");
  }

  getBlockedUsers() {
    return this.http.get<BlockedResponse>("/api/blocked-users");
  }

  getAuditLogs() {
    return this.http.get<AuditResponse>("/api/audit-logs");
  }
}
