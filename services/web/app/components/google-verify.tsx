import { useEffect, useRef, useState } from "react";
import { errorText, postJson } from "~/lib/api-client";
import { setCustomerSession } from "~/lib/customer";
import { useRoot } from "~/lib/i18n";
import { GoogleIcon } from "./auth";
import { Alert, Button, OrDivider } from "./ui";

interface CodeClient {
  requestCode: () => void;
}
interface Gsi {
  accounts: {
    oauth2: {
      initCodeClient: (cfg: {
        client_id: string;
        scope: string;
        ux_mode: "popup";
        login_hint?: string;
        callback: (r: { code?: string; error?: string }) => void;
        error_callback?: (e: { type: string }) => void;
      }) => CodeClient;
    };
  };
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<Gsi> | null = null;

/** Carga Google Identity Services una sola vez (solo si el cliente puede usarlo). */
function loadGsi(): Promise<Gsi> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: Gsi }).google);
    s.onerror = () => {
      loading = null;
      reject(new Error("gsi"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * «Continuar con Google» del cliente final (07-frontend.md §7.5): popup de Google Identity Services; el
 * código se canjea en `api` por el mismo token Bearer que da el código por correo. Funciona en el embed
 * (sin cookies de terceros) porque la respuesta vuelve a esta misma página.
 */
export function GoogleVerify({
  email,
  onVerified,
}: {
  email?: string;
  onVerified: (session: { token: string; email: string }) => void | Promise<void>;
}) {
  const { t, features } = useRoot();
  const [client, setClient] = useState<CodeClient | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = features.googleClientId;
  // El callback cambia en cada render del padre: se lee de una ref para no rehacer el cliente de Google.
  const done = useRef(onVerified);
  done.current = onVerified;
  const errors = useRef(t.booking.errors);
  errors.current = t.booking.errors;

  // El script se carga al mostrar el botón: así el clic abre el popup sin perder el gesto del usuario.
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    loadGsi()
      .then((g) => {
        if (!alive) return;
        setClient(
          g.accounts.oauth2.initCodeClient({
            client_id: clientId,
            scope: "openid email profile",
            ux_mode: "popup",
            ...(email ? { login_hint: email } : {}),
            callback: async (r) => {
              if (!r.code) {
                setBusy(false);
                return;
              }
              try {
                const res = await postJson<{ token: string; user: { email: string } }>(
                  "/api/public/v1/google/verify",
                  { code: r.code },
                );
                const session = { token: res.token, email: res.user.email };
                setCustomerSession(session);
                await done.current(session);
              } catch (err) {
                setError(errorText(errors.current, err));
                setBusy(false);
              }
            },
            error_callback: (e) => {
              setBusy(false);
              if (e.type === "popup_failed_to_open") setError(errors.current.google_blocked);
            },
          }),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [clientId, email]);

  if (!clientId) return null;
  return (
    <div className="space-y-3">
      <OrDivider />
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={!client}
        loading={busy}
        onClick={() => {
          setError(null);
          setBusy(true);
          client?.requestCode();
        }}
      >
        <GoogleIcon />
        {t.auth.google}
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
