import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { idioma, sitio, Then, When } from "../fixtures/sitio";

type Persona = { email: string; dominio: "es" | "en" };

function valorDeCaso(caso: string): string {
  if (caso === "vacío") return "";
  if (caso === "espacios") return "   ";
  if (caso === "control") return "Ana\u0000María";
  if (caso === "bidi") return "Ana\u202eMaría";
  if (caso === "etiquetas") return "<script>alert(1)</script>";
  const m = caso.match(/^texto de (\d+)$/);
  if (m) return "Á".repeat(Number(m[1]));
  return caso;
}

When(
  "la app móvil consulta {string} en el dominio {string}",
  async ({ request, estado }, ruta: string, dominio: string) => {
    const lang = idioma(dominio);
    const res = await request.get(`${sitio[lang]}${ruta}`);
    estado.status = res.status();
    estado.body = await res.text();
    estado.json = res.ok() ? await res.json() : null;
  },
);

Then(
  "la respuesta móvil tiene estado {int} e idioma {string}",
  ({ estado }, status: number, lang: string) => {
    expect(estado.status).toBe(status);
    const data = estado.json as { lang?: string };
    expect(data?.lang).toBe(lang);
  },
);

Then("la configuración móvil incluye login con Google y los esquemas nativos", ({ estado }) => {
  const data = estado.json as {
    features?: { google?: boolean; googleClientId?: string };
    auth?: { schemes?: string[] };
  };
  expect(data?.features?.google).toBe(true);
  expect(typeof data?.features?.googleClientId).toBe("string");
  expect(data?.auth?.schemes).toEqual(expect.arrayContaining(["micitaentiempo", "myappointmentontime"]));
});

When(
  "se registra desde la app móvil como {string} con la contraseña {string}",
  async ({ request, estado }, nombre: string, clave: string) => {
    const p = estado.persona as Persona;
    const res = await request.post(`${sitio[p.dominio]}/api/public/v1/mobile/auth/sign-up`, {
      data: { name: nombre, email: p.email, password: clave },
    });
    estado.status = res.status();
    estado.body = await res.text();
  },
);

When(
  "intenta registrarse desde la app móvil con el nombre {string} y la contraseña {string}",
  async ({ request, estado }, caso: string, clave: string) => {
    const p = estado.persona as Persona;
    const res = await request.post(`${sitio[p.dominio]}/api/public/v1/mobile/auth/sign-up`, {
      data: { name: valorDeCaso(caso), email: p.email, password: clave },
    });
    estado.status = res.status();
    estado.body = await res.text();
  },
);

When("entra desde la app móvil con la contraseña {string}", async ({ request, estado }, clave: string) => {
  const p = estado.persona as Persona;
  const res = await request.post(`${sitio[p.dominio]}/api/public/v1/mobile/auth/sign-in`, {
    data: { email: p.email, password: clave },
  });
  estado.status = res.status();
  estado.body = await res.text();
  if (res.ok()) {
    const json = (await res.json()) as { token?: string; user?: { email?: string } };
    estado.mobileToken = json.token;
    estado.mobileUser = json.user;
  }
});

Then("recibe un token Bearer móvil válido", ({ estado }) => {
  expect(typeof estado.mobileToken).toBe("string");
  expect(String(estado.mobileToken).length).toBeGreaterThan(10);
});

When(
  "crea desde la app móvil la organización {string} y consulta el resumen del panel",
  async ({ request, estado }, nombreOrg: string) => {
    const p = estado.persona as Persona;
    const headers = { Authorization: `Bearer ${String(estado.mobileToken)}` };
    const orgRes = await request.post(`${sitio[p.dominio]}/api/v1/org`, {
      data: { name: nombreOrg, plan: "personal" },
      headers,
    });
    expect(orgRes.status(), await orgRes.text()).toBe(201);
    const sumRes = await request.get(`${sitio[p.dominio]}/api/v1/mobile/summary`, { headers });
    expect(sumRes.status(), await sumRes.text()).toBe(200);
    estado.mobileSummary = await sumRes.json();
  },
);

Then("el resumen móvil incluye la organización {string}", ({ estado }, nombreOrg: string) => {
  const sum = estado.mobileSummary as { org?: { name?: string } };
  expect(sum?.org?.name).toBe(nombreOrg);
});

When("cierra la sesión desde la app móvil", async ({ request, estado }) => {
  const p = estado.persona as Persona;
  const res = await request.post(`${sitio[p.dominio]}/api/public/v1/mobile/auth/sign-out`, {
    data: {},
    headers: { Authorization: `Bearer ${String(estado.mobileToken)}` },
  });
  expect(res.status()).toBe(204);
});

Then("el token móvil ya no permite consultar el resumen del panel", async ({ request, estado }) => {
  const p = estado.persona as Persona;
  const res = await request.get(`${sitio[p.dominio]}/api/v1/mobile/summary`, {
    headers: { Authorization: `Bearer ${String(estado.mobileToken)}` },
  });
  expect(res.status()).toBe(401);
});

When(
  "la app móvil inicia sesión con Google usando el código de prueba {string}",
  async ({ request, estado }, email: string) => {
    const res = await request.post(`${sitio.es}/api/public/v1/mobile/auth/google`, {
      data: {
        code: `prueba:${email}`,
        redirectUri: "micitaentiempo://oauth/google",
        codeVerifier: "verificador-pkce-con-longitud-suficiente-1234567890",
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const json = (await res.json()) as { token: string; user: { email: string } };
    estado.mobileToken = json.token;
    estado.mobileUser = json.user;
  },
);

When(
  "la app móvil inicia sesión con Google usando un idToken para {string}",
  async ({ request, estado }, email: string) => {
    const featRes = await request.get(`${sitio.es}/api/public/v1/features`);
    const feat = (await featRes.json()) as { googleClientId: string };
    const idToken = `e30.${Buffer.from(
      JSON.stringify({
        email,
        name: "Clienta Móvil",
        email_verified: true,
        aud: feat.googleClientId,
        iss: "https://accounts.google.com",
      }),
    ).toString("base64url")}.firma`;
    const res = await request.post(`${sitio.es}/api/public/v1/mobile/auth/google`, {
      data: { idToken },
    });
    expect(res.status(), await res.text()).toBe(201);
    const json = (await res.json()) as { token: string; user: { email: string } };
    estado.mobileToken = json.token;
    estado.mobileUser = json.user;
  },
);

Then("recibe un token Bearer móvil válido para {string}", ({ estado }, email: string) => {
  expect(typeof estado.mobileToken).toBe("string");
  expect((estado.mobileUser as { email?: string })?.email).toBe(email.toLowerCase());
});

Then(
  "el token móvil permite consultar {string} y {string}",
  async ({ request, estado }, ruta1: string, ruta2: string) => {
    const headers = { Authorization: `Bearer ${String(estado.mobileToken)}` };
    for (const ruta of [ruta1, ruta2]) {
      const res = await request.get(`${sitio.es}${ruta}`, { headers });
      expect(res.status(), `${ruta}: ${await res.text()}`).toBe(200);
    }
  },
);

When(
  "la visitante {string} usa un dispositivo {int}x{int} y abre la reserva del tablero en {string}",
  async ({ page, estado }, nombre: string, ancho: number, alto: number, dominio: string) => {
    const lang = idioma(dominio);
    const email = `${nombre.toLowerCase()}-${randomUUID().slice(0, 8)}@escenarios.test`;
    estado.visitanteUi = { nombre, email, lang };
    await page.setViewportSize({ width: ancho, height: alto });
    await page.addInitScript((correo) => {
      (window as unknown as { GSI_CORREO?: string }).GSI_CORREO = correo;
    }, email);
    const slug = (estado.tablero as { slug: string }).slug;
    await page.goto(`${sitio[lang]}${lang === "es" ? "/reservar/" : "/book/"}${slug}`);
  },
);

Then("la pantalla móvil o tablet no presenta desbordamiento horizontal", async ({ page }) => {
  const medida = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    contenido: document.documentElement.scrollWidth,
  }));
  expect(medida.contenido).toBeLessThanOrEqual(medida.viewport + 1);
});

When(
  "abre «Mis citas» en el mismo dispositivo del dominio {string} y cancela su cita",
  async ({ page }, dominio: string) => {
    const lang = idioma(dominio);
    await page.goto(`${sitio[lang]}${lang === "es" ? "/citas" : "/appointments"}`);
    const cancelar = page.getByRole("button", { name: lang === "es" ? "Cancelar" : "Cancel" }).first();
    await expect(cancelar).toBeVisible({ timeout: 15_000 });
    page.once("dialog", (d) => void d.accept());
    await cancelar.click();
  },
);

When(
  "{string} abre «Mis citas» en una tablet {int}x{int} del dominio {string} e inicia sesión con Google",
  async ({ page, estado }, nombre: string, ancho: number, alto: number, dominio: string) => {
    const lang = idioma(dominio);
    const v = (estado.visitantes as Record<string, { email: string }>)[nombre];
    if (!v) throw new Error(`Visitante desconocida: ${nombre}`);
    await page.setViewportSize({ width: ancho, height: alto });
    await page.addInitScript((correo) => {
      (window as unknown as { GSI_CORREO?: string }).GSI_CORREO = correo;
    }, v.email);
    await page.goto(`${sitio[lang]}${lang === "es" ? "/citas" : "/appointments"}`);
    const googleBtn = page.getByRole("button", { name: /Continuar con Google|Continue with Google/ });
    await expect(googleBtn).toBeVisible({ timeout: 15_000 });
    await googleBtn.click();
  },
);

Then(
  "ve {int} cita en la lista de la tablet y sin desbordamiento horizontal",
  async ({ page }, n: number) => {
    await expect(page.getByRole("button", { name: /^Cancelar$|^Cancel$/ })).toHaveCount(n, {
      timeout: 15_000,
    });
    const medida = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      contenido: document.documentElement.scrollWidth,
    }));
    expect(medida.contenido).toBeLessThanOrEqual(medida.viewport + 1);
  },
);
