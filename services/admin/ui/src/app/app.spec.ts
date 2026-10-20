import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { App } from "./app";
import { authInterceptor } from "./auth.interceptor";
import type { User } from "./models";

describe("Panel de administración", () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it("muestra el inicio de sesión cuando no hay token guardado", () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(".login-card")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".admin-layout")).toBeNull();
  });

  it("inicia sesión, guarda el token y carga las estadísticas", () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.loginPassword.set("secreto");
    app.login();

    const login = http.expectOne("/api/auth/login");
    expect(login.request.body).toEqual({ username: "yunerkis", password: "secreto" });
    login.flush({ token: "token-1", user: { id: "1", username: "yunerkis" } });

    http.expectOne("/api/stats").flush({ totalUsers: 10, verifiedUsers: 5 });
    fixture.detectChanges();

    expect(localStorage.getItem("admin_token")).toBe("token-1");
    expect(app.loginPassword()).toBe("");
    expect(fixture.nativeElement.querySelector(".admin-layout")).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Bienvenido, yunerkis");
  });

  it("muestra el error del servidor cuando las credenciales son incorrectas", () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.login();

    http
      .expectOne("/api/auth/login")
      .flush({ error: "Credenciales incorrectas" }, { status: 401, statusText: "Unauthorized" });
    fixture.detectChanges();

    expect(fixture.componentInstance.loginError()).toBe("Credenciales incorrectas");
    expect(fixture.nativeElement.querySelector(".alert-danger").textContent).toContain(
      "Credenciales incorrectas",
    );
    expect(localStorage.getItem("admin_token")).toBeNull();
  });

  it("envía el token guardado en la cabecera Authorization", () => {
    localStorage.setItem("admin_token", "abc");
    TestBed.createComponent(App);

    const me = http.expectOne("/api/auth/me");
    expect(me.request.headers.get("Authorization")).toBe("Bearer abc");
    me.flush({ user: { id: "1", username: "yunerkis" } });
    http.expectOne("/api/stats").flush({});
  });

  it("filtra usuarios por texto y por estado", () => {
    localStorage.setItem("admin_token", "abc");
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    http.expectOne("/api/auth/me").flush({ user: { id: "1", username: "yunerkis" } });
    http.expectOne("/api/stats").flush({});

    app.setTab("users");
    http.expectOne("/api/users").flush({
      users: [
        userFixture({ id: "u1", name: "Ana", email: "ana@example.com", email_verified: true }),
        userFixture({ id: "u2", name: "Luis", email: "luis@example.com", is_blocked: true }),
      ],
    });

    expect(app.filteredUsers().map((u) => u.id)).toEqual(["u1", "u2"]);

    app.userSearch.set("ANA");
    expect(app.filteredUsers().map((u) => u.id)).toEqual(["u1"]);

    app.userSearch.set("");
    app.setUserFilter("blocked");
    expect(app.filteredUsers().map((u) => u.id)).toEqual(["u2"]);
  });

  it("al elegir un motivo predefinido lo copia al campo, salvo «Otro motivo»", () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.selectReasonPreset("Fallo reiterado de cobro de suscripción");
    expect(app.blockReason()).toBe("Fallo reiterado de cobro de suscripción");

    app.selectReasonPreset("Otro motivo especificado manualmente");
    expect(app.blockReason()).toBe("Fallo reiterado de cobro de suscripción");
  });
});

function userFixture(overrides: Partial<User>): User {
  return {
    id: "u",
    name: "",
    email: "",
    email_verified: false,
    org_name: null,
    org_plan: null,
    org_status: null,
    org_cancel_at_period_end: false,
    is_blocked: false,
    ...overrides,
  };
}
