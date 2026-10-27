import { DatePipe, DecimalPipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, computed, inject, type Signal, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { finalize, type Observable } from "rxjs";
import { AdminService } from "./admin.service";
import type {
  AdminUser,
  AuditLog,
  BlockedUser,
  Stats,
  Subscription,
  SubscriptionSummary,
  Tab,
  User,
  UserFilter,
} from "./models";

const TOKEN_KEY = "admin_token";
const USER_KEY = "admin_user";
const DEFAULT_REASON = "Uso abusivo de reservas y spam";
const OTHER_REASON = "Otro motivo especificado manualmente";
const REASON_PRESETS = [
  DEFAULT_REASON,
  "Violación de términos y condiciones de servicio",
  "Fallo reiterado de cobro de suscripción",
  "Actividad sospechosa o vulneración de seguridad",
  OTHER_REASON,
];

@Component({
  selector: "app-root",
  imports: [DatePipe, DecimalPipe, FormsModule],
  templateUrl: "./app.html",
})
export class App {
  private readonly api = inject(AdminService);

  // Sesión
  readonly loginUsername = signal("yunerkis");
  readonly loginPassword = signal("");
  readonly isLoggedIn = signal(false);
  readonly adminUser = signal<AdminUser | null>(null);
  readonly loading = signal(false);
  readonly loginError = signal<string | null>(null);

  // Navegación y datos
  readonly currentTab = signal<Tab>("stats");
  readonly stats = signal<Stats>({});
  readonly users = signal<User[]>([]);
  readonly userSearch = signal("");
  readonly userFilter = signal<UserFilter>("all");
  readonly filteredUsers: Signal<User[]> = computed(() => {
    const q = this.userSearch().toLowerCase().trim();
    const filter = this.userFilter();
    return this.users().filter((user) => {
      const matchesText =
        !q ||
        (!!user.name && user.name.toLowerCase().includes(q)) ||
        (!!user.email && user.email.toLowerCase().includes(q));
      if (!matchesText) return false;
      if (filter === "verified") return user.email_verified;
      if (filter === "blocked") return user.is_blocked;
      return true;
    });
  });

  readonly cancellations = signal<Subscription[]>([]);
  readonly subscriptionSummary = signal<SubscriptionSummary>({
    totalSubscriptions: 0,
    totalCanceled: 0,
    churnRatePercent: 0,
  });
  readonly blockedUsers = signal<BlockedUser[]>([]);
  readonly auditLogs = signal<AuditLog[]>([]);

  // Modal de bloqueo
  readonly modalOpen = signal(false);
  readonly selectedUser = signal<User | null>(null);
  readonly reasonPresets = REASON_PRESETS;
  readonly selectedReasonPreset = signal(DEFAULT_REASON);
  readonly blockReason = signal(DEFAULT_REASON);

  // Mensajes de retroalimentación
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.restoreSession();
  }

  login(): void {
    this.loading.set(true);
    this.loginError.set(null);

    this.api
      .login(this.loginUsername(), this.loginPassword())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.isLoggedIn.set(true);
          this.adminUser.set(res.user);
          localStorage.setItem(TOKEN_KEY, res.token);
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          this.loginPassword.set("");
          this.loadCurrentTabData();
          this.notify("success", `Sesión iniciada con éxito. Bienvenido, ${res.user.username}`);
        },
        error: (err: HttpErrorResponse) => {
          this.loginError.set(err.error?.error || "Error al iniciar sesión");
        },
      });
  }

  onLoginSubmit(event: Event): void {
    event.preventDefault();
    this.login();
  }

  logout(): void {
    this.api
      .logout()
      .pipe(finalize(() => this.clearSession()))
      .subscribe({ error: () => undefined });
  }

  setTab(tab: Tab): void {
    this.currentTab.set(tab);
    this.loadCurrentTabData();
  }

  refreshCurrentTab(): void {
    this.loadCurrentTabData();
    this.notify("success", "Datos actualizados");
  }

  loadCurrentTabData(): void {
    if (!this.isLoggedIn()) return;

    switch (this.currentTab()) {
      case "stats":
        this.load(this.api.getStats(), (data) => this.stats.set(data));
        break;
      case "users":
        this.load(this.api.getUsers(this.userSearch(), this.userFilter()), (res) =>
          this.users.set(res.users ?? []),
        );
        break;
      case "subscriptions":
        this.load(this.api.getSubscriptions(), (res) => {
          this.cancellations.set(res.cancellations ?? []);
          this.subscriptionSummary.set(res.summary ?? this.subscriptionSummary());
        });
        break;
      case "blocked":
        this.load(this.api.getBlockedUsers(), (res) => this.blockedUsers.set(res.blocked ?? []));
        break;
      case "audit":
        this.load(this.api.getAuditLogs(), (res) => this.auditLogs.set(res.logs ?? []));
        break;
    }
  }

  setUserFilter(filter: UserFilter): void {
    this.userFilter.set(filter);
  }

  openBlockModal(user: User): void {
    this.selectedUser.set(user);
    this.selectedReasonPreset.set(DEFAULT_REASON);
    this.blockReason.set(DEFAULT_REASON);
    this.modalOpen.set(true);
  }

  closeBlockModal(): void {
    this.modalOpen.set(false);
    this.selectedUser.set(null);
  }

  selectReasonPreset(preset: string): void {
    this.selectedReasonPreset.set(preset);
    if (preset !== OTHER_REASON) {
      this.blockReason.set(preset);
    }
  }

  confirmBlockUser(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.loading.set(true);

    this.api
      .blockUser(user.id, user.email, this.blockReason())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.modalOpen.set(false);
          this.notify("success", `Usuario ${user.email} bloqueado y sesiones revocadas`);
          this.loadCurrentTabData();
        },
        error: (err: HttpErrorResponse) => {
          this.notify("danger", err.error?.error || "Error al bloquear usuario");
        },
      });
  }

  unblockUser(user: User): void {
    if (!confirm(`¿Deseas desbloquear a ${user.email}?`)) return;
    this.unblock(user.id, `Usuario ${user.email} desbloqueado`, "Error al desbloquear usuario");
  }

  unblockDirect(userId: string): void {
    if (!confirm("¿Deseas desbloquear a este usuario?")) return;
    this.unblock(userId, "Usuario desbloqueado con éxito", "Error al desbloquear");
  }

  private restoreSession(): void {
    if (!localStorage.getItem(TOKEN_KEY)) return;

    this.api.getMe().subscribe({
      next: (res) => {
        this.isLoggedIn.set(true);
        this.adminUser.set(res.user);
        this.loadCurrentTabData();
      },
      error: () => {
        this.isLoggedIn.set(false);
        localStorage.removeItem(TOKEN_KEY);
      },
    });
  }

  private clearSession(): void {
    this.isLoggedIn.set(false);
    this.adminUser.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private load<T>(request: Observable<T>, onData: (data: T) => void): void {
    this.loading.set(true);
    request.pipe(finalize(() => this.loading.set(false))).subscribe(onData);
  }

  private unblock(userId: string, successText: string, errorText: string): void {
    this.loading.set(true);

    this.api
      .unblockUser(userId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.notify("success", successText);
          this.loadCurrentTabData();
        },
        error: (err: HttpErrorResponse) => {
          this.notify("danger", err.error?.error || errorText);
        },
      });
  }

  private notify(type: "success" | "danger", msg: string): void {
    if (type === "success") {
      this.successMessage.set(msg);
      this.errorMessage.set(null);
    } else {
      this.errorMessage.set(msg);
      this.successMessage.set(null);
    }
    setTimeout(() => {
      if (type === "success") this.successMessage.set(null);
      else this.errorMessage.set(null);
    }, 5000);
  }
}
