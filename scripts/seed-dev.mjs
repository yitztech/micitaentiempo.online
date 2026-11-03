/**
 * Semilla de usuarios de desarrollo para pruebas locales (ADR 0006).
 *
 * Crea o asegura:
 * 1. no_calendar@micitaentiempo.online (sin calendarios creados).
 * 2. one_calendar@micitaentiempo.online (con 1 calendario activo: "One Calendar").
 *
 * Ambos con contraseña: Password.Password.1
 */

const API_BASE = process.env.API_BASE || "http://micitaentiempo.localhost:8080";
const MAILPIT_BASE = process.env.MAILPIT_BASE || "http://127.0.0.1:8026";
const PASSWORD = "Password.Password.1";

async function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function obtenerTokenCorreo(email) {
  for (let intento = 0; intento < 10; intento++) {
    const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`);
    if (res.ok) {
      const data = await res.json();
      const msg = data.messages?.find((m) =>
        m.To?.some((t) => t.Address.toLowerCase() === email.toLowerCase()),
      );
      if (msg) {
        const detalleRes = await fetch(`${MAILPIT_BASE}/api/v1/message/${msg.ID}`);
        if (detalleRes.ok) {
          const detalle = await detalleRes.json();
          const html = detalle.HTML || detalle.Text || "";
          const match = html.match(/token=([a-zA-Z0-9_\-.]+)/);
          if (match) return match[1];
        }
      }
    }
    await esperar(500);
  }
  return null;
}

async function registrarYVerificar(name, email) {
  // Intentar login primero por si ya existe
  const loginRes = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: API_BASE,
      Host: new URL(API_BASE).host,
    },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  if (loginRes.ok) {
    const cookie = loginRes.headers.get("set-cookie") || "";
    return { existe: true, cookie };
  }

  // Si no existe, registrar
  const signupRes = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: API_BASE,
      Host: new URL(API_BASE).host,
    },
    body: JSON.stringify({
      name,
      email,
      password: PASSWORD,
      callbackURL: "/panel",
      locale: "es",
    }),
  });

  if (!signupRes.ok && signupRes.status !== 409) {
    const errorText = await signupRes.text();
    throw new Error(`Error registrando ${email}: ${signupRes.status} ${errorText}`);
  }

  // Buscar correo en Mailpit
  const token = await obtenerTokenCorreo(email);
  if (token) {
    await fetch(`${API_BASE}/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=/panel`, {
      headers: { Host: new URL(API_BASE).host },
    });
  }

  // Iniciar sesión y obtener cookie
  const authRes = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: API_BASE,
      Host: new URL(API_BASE).host,
    },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  if (!authRes.ok) {
    const errorText = await authRes.text();
    throw new Error(`Error al iniciar sesión con ${email}: ${authRes.status} ${errorText}`);
  }

  const cookie = authRes.headers.get("set-cookie") || "";
  return { existe: false, cookie };
}

async function main() {
  console.log("Iniciando creación de usuarios de desarrollo...");

  // 1. no_calendar@micitaentiempo.online
  console.log("1. Configurando usuario sin calendarios: no_calendar@micitaentiempo.online");
  await registrarYVerificar("Usuario Sin Calendario", "no_calendar@micitaentiempo.online");
  console.log("✓ no_calendar@micitaentiempo.online listo (0 calendarios)");

  // 2. one_calendar@micitaentiempo.online
  console.log("2. Configurando usuario con 1 calendario: one_calendar@micitaentiempo.online");
  const { cookie } = await registrarYVerificar("One Calendar", "one_calendar@micitaentiempo.online");

  // Verificar si ya tiene calendarios
  const calRes = await fetch(`${API_BASE}/api/v1/calendars`, {
    headers: {
      Cookie: cookie,
      Host: new URL(API_BASE).host,
    },
  });

  let tieneCalendario = false;
  if (calRes.ok) {
    const calendarios = await calRes.json();
    if (Array.isArray(calendarios) && calendarios.length > 0) {
      tieneCalendario = true;
    }
  }

  if (!tieneCalendario) {
    // Asegurar organización
    await fetch(`${API_BASE}/api/v1/org`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: API_BASE,
        Host: new URL(API_BASE).host,
      },
      body: JSON.stringify({ name: "Negocio One Calendar", plan: "personal" }),
    });

    // Crear calendario
    const createCalRes = await fetch(`${API_BASE}/api/v1/calendars`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: API_BASE,
        Host: new URL(API_BASE).host,
      },
      body: JSON.stringify({
        name: "One Calendar",
        slug: "one-calendar",
        timezone: "America/Mexico_City",
        country: "MX",
      }),
    });

    if (!createCalRes.ok && createCalRes.status !== 409) {
      const err = await createCalRes.text();
      console.warn("Aviso al crear calendario:", createCalRes.status, err);
    } else {
      console.log("✓ Calendario 'One Calendar' creado para one_calendar@micitaentiempo.online");
    }
  } else {
    console.log("✓ one_calendar@micitaentiempo.online ya cuenta con calendario activo");
  }

  console.log("\nResumen de credenciales de desarrollo:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("• Usuario sin calendario:");
  console.log("  Correo:     no_calendar@micitaentiempo.online");
  console.log("  Contraseña: Password.Password.1");
  console.log("• Usuario con 1 calendario:");
  console.log("  Correo:     one_calendar@micitaentiempo.online");
  console.log("  Contraseña: Password.Password.1");
  console.log("  Calendario: One Calendar (/citas/one-calendar)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch((err) => {
  console.error("Fallo la semilla de desarrollo:", err);
  process.exit(1);
});
