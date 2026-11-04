import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { AUTH_NAME_ALLOWED, AUTH_NAME_MAX, AuthName, EmailField } from "../../packages/schemas/dist/index.js";
import { type BookingTarget, createBookingFlow } from "./src/booking-flow.ts";
import { type ConnState, createConnectivityController, submitOrQueue } from "./src/connectivity.ts";
import {
  COUNTRIES,
  createEncryptedStorage,
  createMobileClient,
  createSyncEngine,
  getCatalog,
  MOBILE_LANGUAGES,
  MOBILE_SELECTORS,
  MOBILE_STRINGS,
  type MobileBootstrapResponse,
  type MobileLang,
  type MobilePanelSummary,
  type MobilePlatform,
  type PrivateBusinessProfile,
  type PublicBusinessProfile,
  type PublicBusinessSummary,
  resolveDeviceLayout,
} from "./src/index.ts";
import { nativeStorageBackend } from "./src/native-storage.ts";
import { refreshCachedSession, requestSignOut, unresolvedOperations } from "./src/session-exit.ts";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

/** Android emulator alcanza el host en 10.0.2.2; el simulador de iOS comparte localhost. */
function defaultBaseUrl(platform: MobilePlatform): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  return platform === "android" ? "http://10.0.2.2:8080" : "http://localhost:8080";
}

type Booking = { id: string; status: string; start: string; end: string };
type AuthMode = "signIn" | "signUp" | "forgot";
type NavTab = "directory" | "appointments" | "businessProfile" | "account";

/**
 * App Expo (Android e iOS, teléfonos y tablets). Reutiliza los catálogos @mcet/i18n, la validación
 * del frontend (validateRequest + @mcet/schemas) y se conecta al backend con sesión Bearer.
 */
export default function App() {
  const platform: MobilePlatform = Platform.OS === "ios" ? "ios" : "android";
  const { width, height } = useWindowDimensions();
  const layout = resolveDeviceLayout({ width, height, platform });
  const [apiUrl, setApiUrl] = useState(() => defaultBaseUrl(platform));
  // El controlador de conexión se crea en un efecto; el cliente le avisa de los fallos de transporte por esta referencia.
  const connectivityRef = useRef<ReturnType<typeof createConnectivityController> | null>(null);
  const client = useMemo(
    () =>
      createMobileClient({
        baseUrl: apiUrl,
        platform,
        onTransportError: () => connectivityRef.current?.reportFailure(),
      }),
    [apiUrl, platform],
  );
  const storage = useMemo(
    () => createEncryptedStorage({ baseUrl: apiUrl, backend: nativeStorageBackend }),
    [apiUrl],
  );

  const [conn, setConn] = useState<ConnState>("connecting");
  const [boot, setBoot] = useState<MobileBootstrapResponse | null>(null);

  // Navegación principal
  const [navTab, setNavTab] = useState<NavTab>("directory");

  // Idioma activo con soporte para los 6 idiomas y banderas
  const [userLang, setUserLang] = useState<MobileLang | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Modo de autenticación: entrada, registro o recuperación
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");

  // Directorio y perfiles públicos
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryItems, setDirectoryItems] = useState<PublicBusinessSummary[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<PublicBusinessProfile | null>(null);

  // Perfil de negocio del propietario
  const [ownerProfile, setOwnerProfile] = useState<PrivateBusinessProfile | null>(null);
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [ownerDescription, setOwnerDescription] = useState("");
  const [ownerPrimaryCategory, setOwnerPrimaryCategory] = useState<string | null>(null);
  const [ownerWebsiteUrl, setOwnerWebsiteUrl] = useState("");
  const [ownerTermsUrl, setOwnerTermsUrl] = useState("");

  // Estado offline y sincronización
  const [pendingOpsCount, setPendingOpsCount] = useState(0);
  const [lastDataUpdate, setLastDataUpdate] = useState<string | null>(null);

  // Campos de formulario auth
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [phone, setPhone] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<(typeof COUNTRIES)[number]>(() => {
    const first = COUNTRIES[0];
    if (!first) throw new Error("No hay países configurados");
    return first;
  });
  const [showCountryMenu, setShowCountryMenu] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [summary, setSummary] = useState<MobilePanelSummary | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  const lang: MobileLang = userLang ?? boot?.lang ?? "es";
  const t = getCatalog(lang);
  const s = MOBILE_STRINGS[lang] ?? MOBILE_STRINGS.es;

  // Recorrido de reserva: la intención (destino elegido) vive aquí y sobrevive a re-renderizados y al acceso.
  const bookingContext = useRef({
    siteUrl: "",
    lang: "es" as MobileLang,
    isOnline: (): boolean => false,
    openBrowser: async (_url: string): Promise<void> => {},
    listBookings: async (): Promise<Array<{ id: string }> | null> => null,
  });
  bookingContext.current = {
    siteUrl: boot?.siteUrl ?? "",
    lang,
    isOnline: () => connectivityRef.current?.state() === "connected",
    // Navegador seguro del sistema; la sesión de la app no viaja en la URL.
    openBrowser: async (url) => {
      await WebBrowser.openBrowserAsync(url);
    },
    listBookings: async () => (summary?.user?.id ? await client.myBookings(false) : null),
  };
  const bookingFlow = useMemo(() => createBookingFlow(() => bookingContext.current), []);

  // Actualizar contador de operaciones pendientes
  const refreshPendingCount = useCallback(async () => {
    if (!summary?.user?.id) {
      setPendingOpsCount(0);
      return;
    }
    const q = await storage.getQueue(summary.user.id);
    // Cuenta todo lo no confirmado (también en envío, fallido, caducado o esperando acceso).
    setPendingOpsCount(unresolvedOperations(q).length);
  }, [storage, summary?.user?.id]);

  useEffect(() => {
    let alive = true;
    async function init() {
      try {
        const res = await client.bootstrap();
        if (!alive) return;
        setBoot(res);
        connectivityRef.current?.markConnected();
        // Un fallo que no sea de sesión deja la pantalla como está: el controlador de conexión lo reintenta.
        const session = await refreshCachedSession({ client, storage, isCancelled: () => !alive }).catch(
          () => null,
        );
        if (session?.status === "refreshed" && alive) {
          setSummary(session.summary);
          setBookings(session.bookings);
          setLastDataUpdate(new Date().toISOString());
        }
      } catch {
        if (platform === "android" && apiUrl.includes("10.0.2.2")) {
          try {
            const fallbackClient = createMobileClient({ baseUrl: "http://127.0.0.1:8080", platform });
            const res = await fallbackClient.bootstrap();
            if (!alive) return;
            setApiUrl("http://127.0.0.1:8080");
            setBoot(res);
            return;
          } catch {}
        }
        if (alive) {
          connectivityRef.current?.reportFailure();
          // Si estamos offline, cargar sesión previamente persistida
          const cachedSession = await storage.loadSession();
          if (cachedSession && !cachedSession.isStale && alive) {
            client.setToken(cachedSession.session.token);
            const cachedSummary = await storage.loadSummary(cachedSession.session.user.id);
            if (cachedSummary && !cachedSummary.isStale && alive) {
              setSummary(cachedSummary.data as MobilePanelSummary);
            } else {
              setSummary({ user: cachedSession.session.user, org: null, calendars: [] });
            }
            const cachedBookings = await storage.loadBookings(cachedSession.session.user.id);
            if (cachedBookings && !cachedBookings.isStale && alive) {
              setBookings(cachedBookings.data as Booking[]);
              setLastDataUpdate(cachedBookings.cachedAt);
            }
          }
          const cachedDir = await storage.loadDirectory();
          if (cachedDir?.data?.businesses && !cachedDir.isStale && alive) {
            setDirectoryItems(cachedDir.data.businesses as PublicBusinessSummary[]);
          }
        }
      }
    }
    void init();
    return () => {
      alive = false;
    };
  }, [client, apiUrl, platform, storage]);

  // Estado de conexión decidido por el servidor: fallos de transporte → sin conexión; comprobación periódica y al
  // volver a primer plano; al recuperarse se restaura la sesión guardada y se refrescan los datos.
  useEffect(() => {
    setConn("connecting");
    const controller = createConnectivityController({
      onChange: setConn,
      probe: async (signal) => {
        const nextBoot = await client.bootstrap(signal);
        const session = await refreshCachedSession({
          client,
          storage,
          isCancelled: () => signal.aborted,
        });
        if (session.status === "refreshed" && !signal.aborted) {
          setSummary(session.summary);
          setBookings(session.bookings);
          setLastDataUpdate(new Date().toISOString());
        } else if (session.status === "invalidated" && !signal.aborted) {
          setSummary(null);
          setBookings(null);
        }
        if (!signal.aborted) setBoot(nextBoot);
      },
    });
    connectivityRef.current = controller;
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void controller.checkNow();
    });
    return () => {
      appState.remove();
      controller.stop();
      if (connectivityRef.current === controller) connectivityRef.current = null;
    };
  }, [client, storage]);

  // Al conectar: primero se envía la cola durable y después se descargan los cambios del servidor (ADR 0020).
  useEffect(() => {
    if (conn !== "connected" || !summary?.user?.id) return;
    const accountId = summary.user.id;
    const syncEngine = createSyncEngine({ client, storage, accountId });
    void syncEngine
      .sync()
      .then(() => syncEngine.pull())
      .then(async (pulled) => {
        await refreshPendingCount();
        if (pulled.applied > 0) {
          const cached = await storage.loadOwnerProfile(accountId);
          if (cached) setOwnerProfile(cached.data as PrivateBusinessProfile);
        }
      })
      .catch(() => {
        // Un fallo de almacenamiento o red no debe romper la pantalla: el siguiente ciclo lo reintenta.
      });
  }, [conn, client, storage, summary?.user?.id, refreshPendingCount]);

  const loadSession = useCallback(async () => {
    const [sum, list] = await Promise.all([client.panelSummary(), client.myBookings(false)]);
    // Un inicio de sesión nuevo reabre la cuenta si se cerró antes en este dispositivo.
    storage.openAccount(sum.user.id);
    setSummary(sum);
    setBookings(list);
    setLastDataUpdate(new Date().toISOString());
    // Persiste sesión y citas de manera cifrada
    const token = client.getToken();
    if (token) {
      await storage.saveSession({ token, user: sum.user });
      await storage.saveBookings(sum.user.id, list);
      await storage.saveSummary(sum.user.id, sum);
    }
    await refreshPendingCount();
  }, [client, storage, refreshPendingCount]);

  // Carga de directorio
  const loadDirectory = useCallback(async () => {
    try {
      const res = await client.searchBusinesses({ q: directorySearch || undefined });
      setDirectoryItems(res.items);
      await storage.saveDirectory({ businesses: res.items });
    } catch {
      const cached = await storage.loadDirectory();
      if (cached?.data?.businesses) {
        setDirectoryItems(cached.data.businesses as PublicBusinessSummary[]);
      }
    }
  }, [client, directorySearch, storage]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  // Carga de perfil de propietario si tiene organización
  const loadOwnerProfile = useCallback(async () => {
    if (!summary?.org || !summary?.user?.id) return;
    try {
      const p = await client.getOwnerBusinessProfile();
      setOwnerProfile(p);
      setOwnerDisplayName(p.content.displayName);
      setOwnerDescription(p.content.description);
      setOwnerPrimaryCategory(p.content.primaryCategory);
      setOwnerWebsiteUrl(p.content.websiteUrl ?? "");
      setOwnerTermsUrl(p.content.termsUrl ?? "");
      await storage.saveOwnerProfile(summary.user.id, p);
    } catch {
      const cached = await storage.loadOwnerProfile(summary.user.id);
      if (cached?.data && !cached.isStale) {
        const p = cached.data as PrivateBusinessProfile;
        setOwnerProfile(p);
        setOwnerDisplayName(p.content.displayName);
        setOwnerDescription(p.content.description);
        setOwnerPrimaryCategory(p.content.primaryCategory);
        setOwnerWebsiteUrl(p.content.websiteUrl ?? "");
        setOwnerTermsUrl(p.content.termsUrl ?? "");
      }
    }
  }, [client, summary?.org, summary?.user?.id, storage]);

  useEffect(() => {
    if (summary?.org) {
      void loadOwnerProfile();
    }
  }, [summary?.org, loadOwnerProfile]);

  // Validaciones del lado del cliente antes de enviar
  const validateForm = useCallback((): boolean => {
    setError(null);
    setInfoMessage(null);

    // Validación de Correo: longitud 5-254 y formato RFC
    const cleanEmail = email.trim();
    if (!EmailField.safeParse(cleanEmail).success) {
      setError(s.emailError);
      return false;
    }

    if (authMode === "forgot") return true;

    // Validación de Contraseña
    // biome-ignore lint/suspicious/noControlCharactersInRegex: validación de controles
    if (/[\u0000-\u001f\u007f-\u009f]/.test(password)) {
      setError(s.passwordError);
      return false;
    }

    if (authMode === "signIn") {
      if (!password || password.length < 8 || password.length > 128) {
        setError(s.passwordError);
        return false;
      }
    } else if (authMode === "signUp") {
      // Registro exige mín 12, máx 128
      if (!password || password.length < 12 || password.length > 128) {
        setError(s.passwordError);
        return false;
      }

      if (password !== confirmPassword) {
        setError(t.auth.signUp.passwordMismatch);
        return false;
      }

      if (!AuthName.safeParse(name).success) {
        setError(t.auth.errors.invalid_name_characters);
        return false;
      }

      // Teléfono en registro: opcional, pero si existe solo numéricos y longitud válida
      const cleanPhone = phone.trim();
      if (cleanPhone) {
        const fullPhone = `${selectedCountry.dialCode} ${cleanPhone}`;
        if (!/^\+?[0-9\s\-()]{7,20}$/.test(fullPhone)) {
          setError(s.phoneError);
          return false;
        }
      }
    }

    return true;
  }, [
    authMode,
    email,
    password,
    confirmPassword,
    name,
    phone,
    selectedCountry,
    s,
    t.auth.signUp.passwordMismatch,
    t.auth.errors.invalid_name_characters,
  ]);

  const onSignIn = useCallback(async () => {
    if (!validateForm()) return;
    setBusy(true);
    setError(null);
    try {
      await client.signIn({ email: email.trim(), password });
      await loadSession();
      setPassword("");
    } catch {
      setError(s.signInError);
    } finally {
      setBusy(false);
    }
  }, [client, email, password, validateForm, loadSession, s.signInError]);

  const onSignUp = useCallback(async () => {
    if (!validateForm()) return;
    setBusy(true);
    setError(null);
    try {
      const fullPhone = phone.trim() ? `${selectedCountry.dialCode} ${phone.trim()}` : undefined;
      await client.signUp({
        name: AuthName.parse(name),
        email: email.trim(),
        password,
        phone: fullPhone,
      });
      setInfoMessage(s.signUpSuccess);
      setPassword("");
      setConfirmPassword("");
    } catch {
      setError(s.signInError);
    } finally {
      setBusy(false);
    }
  }, [client, name, email, password, phone, selectedCountry, validateForm, s.signUpSuccess, s.signInError]);

  const onForgot = useCallback(async () => {
    if (!validateForm()) return;
    setBusy(true);
    setError(null);
    try {
      await client.forgotPassword({ email: email.trim() });
      setInfoMessage(s.forgotSuccess);
    } catch {
      setError(s.signInError);
    } finally {
      setBusy(false);
    }
  }, [client, email, validateForm, s.forgotSuccess, s.signInError]);

  const onGoogle = useCallback(async () => {
    setError(null);
    const clientId = boot?.features.googleClientId;
    if (!boot?.features.google || !clientId) {
      setError(s.googleUnavailable);
      return;
    }
    const redirectUri = AuthSession.makeRedirectUri({ scheme: "micitaentiempo", path: "oauth/google" });
    const request = new AuthSession.AuthRequest({
      clientId,
      redirectUri,
      scopes: ["openid", "email", "profile"],
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    });
    const result = await request.promptAsync(GOOGLE_DISCOVERY);
    if (result.type !== "success" || !result.params.code) return;
    setBusy(true);
    try {
      await client.signInWithGoogle({
        code: result.params.code,
        redirectUri,
        codeVerifier: request.codeVerifier,
      });
      await loadSession();
    } catch {
      setError(s.signInError);
    } finally {
      setBusy(false);
    }
  }, [boot, client, loadSession, s.googleUnavailable, s.signInError]);

  const onSignOut = useCallback(async () => {
    const accountId = summary?.user?.id;
    if (!accountId) {
      await storage.clearSession();
      await client.signOut().catch(() => client.setToken(null));
      return;
    }
    setError(null);
    setInfoMessage(null);
    try {
      const result = await requestSignOut({
        accountId,
        client,
        storage,
        // Avisa de los cambios sin sincronizar antes de borrarlos; cancelar conserva la sesión y los cambios.
        confirmDiscard: (count) =>
          new Promise<boolean>((resolve) => {
            Alert.alert(
              s.signOutPendingTitle,
              s.signOutPendingBody.replace("{count}", String(count)),
              [
                { text: s.signOutCancel, style: "cancel", onPress: () => resolve(false) },
                { text: s.signOutDiscard, style: "destructive", onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            );
          }),
      });
      if (result.status === "cancelled") return;
      setSummary(null);
      setBookings(null);
      setOwnerProfile(null);
      setPendingOpsCount(0);
      if (result.status === "purge_failed") setError(s.signOutFailed);
      else if (result.status === "signed_out_unrevoked") setInfoMessage(s.signOutUnrevoked);
    } catch {
      // No se pudo leer o purgar el almacenamiento: no se informa de un cierre limpio.
      setError(s.signOutFailed);
    }
  }, [
    client,
    storage,
    summary?.user?.id,
    s.signOutPendingTitle,
    s.signOutPendingBody,
    s.signOutCancel,
    s.signOutDiscard,
    s.signOutFailed,
    s.signOutUnrevoked,
  ]);

  const onSaveOwnerProfile = useCallback(async () => {
    if (!summary?.org || !summary?.user?.id) return;
    setBusy(true);
    setError(null);
    setInfoMessage(null);
    const updates = {
      displayName: ownerDisplayName.trim(),
      description: ownerDescription.trim(),
      primaryCategory: (ownerPrimaryCategory as never) || null,
      secondaryCategories: ownerProfile?.content.secondaryCategories ?? [],
      websiteUrl: ownerWebsiteUrl.trim() || null,
      termsUrl: ownerTermsUrl.trim() || null,
      socialLinks: ownerProfile?.content.socialLinks ?? [],
    };
    try {
      const accountId = summary.user.id;
      const outcome = await submitOrQueue({
        isOnline: () => connectivityRef.current?.state() === "connected",
        operationId: Crypto.randomUUID(),
        attempt: (operationId) =>
          client.updateOwnerBusinessProfile(updates, ownerProfile?.version ?? 1, operationId),
        // Sin conexión, o con un resultado incierto por fallo de red: se encola con la misma clave de idempotencia.
        enqueue: async (operationId, { attempted }) => {
          if (!ownerProfile) throw new Error("Profile not available offline");
          const syncEngine = createSyncEngine({
            client,
            storage,
            accountId,
            createOperationId: Crypto.randomUUID,
          });
          await syncEngine.enqueue({
            kind: "profile.update",
            resourceId: ownerProfile.businessId,
            businessId: ownerProfile.businessId,
            baseVersion: ownerProfile?.version ?? 1,
            payload: updates,
            customOperationId: operationId,
            attempted,
          });
        },
      });
      if (outcome.status === "sent") {
        setOwnerProfile(outcome.value);
        await storage.saveOwnerProfile(accountId, outcome.value);
        setInfoMessage(t.panel.businessProfile.savedSuccess);
      } else {
        await refreshPendingCount();
        setInfoMessage(s.offlineSaved);
      }
    } catch (err: unknown) {
      const errObj = err as { body?: { message?: string } };
      setError(errObj?.body?.message ?? "Error al guardar el perfil");
    } finally {
      setBusy(false);
    }
  }, [
    summary?.org,
    summary?.user?.id,
    ownerDisplayName,
    ownerDescription,
    ownerPrimaryCategory,
    ownerWebsiteUrl,
    ownerTermsUrl,
    ownerProfile,
    client,
    storage,
    refreshPendingCount,
    t.panel.businessProfile.savedSuccess,
    s.offlineSaved,
  ]);

  const onPublish = useCallback(async () => {
    if (!summary?.org || !ownerProfile) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await client.publishBusiness(ownerProfile.version, Crypto.randomUUID());
      setOwnerProfile(updated);
      setInfoMessage(t.panel.businessProfile.publishedSuccess);
    } catch (err: unknown) {
      const errObj = err as { body?: { message?: string } };
      setError(errObj?.body?.message ?? "Error al publicar");
    } finally {
      setBusy(false);
    }
  }, [summary?.org, ownerProfile, client, t.panel.businessProfile.publishedSuccess]);

  const onUnpublish = useCallback(async () => {
    if (!summary?.org || !ownerProfile) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await client.unpublishBusiness(ownerProfile.version, Crypto.randomUUID());
      setOwnerProfile(updated);
      setInfoMessage(t.panel.businessProfile.unpublishedSuccess);
    } catch (err: unknown) {
      const errObj = err as { body?: { message?: string } };
      setError(errObj?.body?.message ?? "Error al despublicar");
    } finally {
      setBusy(false);
    }
  }, [summary?.org, ownerProfile, client, t.panel.businessProfile.unpublishedSuccess]);

  const signedIn = summary !== null;
  const bannerText = conn === "connected" ? s.connected : conn === "offline" ? s.offline : s.connecting;
  const currentLangObj = MOBILE_LANGUAGES.find((l) => l.lang === lang) ?? MOBILE_LANGUAGES[0];
  if (!currentLangObj) throw new Error("No hay idiomas configurados");

  const authTabs = (
    <View style={styles.tabRow}>
      <Pressable
        testID={MOBILE_SELECTORS.tabSignIn}
        onPress={() => {
          setAuthMode("signIn");
          setError(null);
          setInfoMessage(null);
        }}
        style={[styles.tabButton, authMode === "signIn" && styles.tabButtonActive]}
      >
        <Text style={[styles.tabText, authMode === "signIn" && styles.tabTextActive]}>
          {t.common.nav.signIn}
        </Text>
      </Pressable>
      <Pressable
        testID={MOBILE_SELECTORS.tabSignUp}
        onPress={() => {
          setAuthMode("signUp");
          setError(null);
          setInfoMessage(null);
        }}
        style={[styles.tabButton, authMode === "signUp" && styles.tabButtonActive]}
      >
        <Text style={[styles.tabText, authMode === "signUp" && styles.tabTextActive]}>
          {t.common.nav.signUp}
        </Text>
      </Pressable>
    </View>
  );

  const authCard = (
    <View style={styles.card}>
      {authTabs}
      <Text style={styles.h2} accessibilityRole="header">
        {authMode === "signIn"
          ? t.auth.signIn.title
          : authMode === "signUp"
            ? t.auth.signUp.title
            : t.auth.forgot.title}
      </Text>

      {authMode === "signIn" ? (
        <Pressable
          testID={MOBILE_SELECTORS.googleButton}
          accessibilityRole="button"
          accessibilityLabel={t.auth.google}
          onPress={onGoogle}
          style={({ pressed }) => [styles.button, styles.googleButton, pressed && styles.pressed]}
        >
          <Text style={styles.googleText}>{t.auth.google}</Text>
        </Pressable>
      ) : null}

      {authMode === "signUp" ? (
        <>
          <Text style={styles.label}>{t.auth.fields.name}</Text>
          <TextInput
            testID={MOBILE_SELECTORS.nameInput}
            accessibilityLabel={t.auth.fields.name}
            value={name}
            onChangeText={(value) => {
              const filtered = value.replace(AUTH_NAME_ALLOWED, "");
              setError(filtered !== value ? t.auth.errors.invalid_name_characters : null);
              setName(filtered);
            }}
            maxLength={AUTH_NAME_MAX}
            style={styles.input}
          />
        </>
      ) : null}

      <Text style={styles.label}>{t.auth.fields.email}</Text>
      <TextInput
        testID={MOBILE_SELECTORS.emailInput}
        accessibilityLabel={t.auth.fields.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        maxLength={254}
        style={styles.input}
      />

      {authMode !== "forgot" ? (
        <>
          <Text style={styles.label}>{t.auth.fields.password}</Text>
          <View style={styles.passwordRow}>
            <TextInput
              testID={MOBILE_SELECTORS.passwordInput}
              accessibilityLabel={t.auth.fields.password}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
              maxLength={128}
              style={[styles.input, styles.passwordInput]}
            />
            <PasswordVisibility
              visible={passwordVisible}
              onPress={() => setPasswordVisible((v) => !v)}
              label={passwordVisible ? t.common.ui.hidePassword : t.common.ui.showPassword}
            />
          </View>
        </>
      ) : null}

      {authMode === "signUp" ? (
        <>
          <Text style={styles.label}>{t.auth.fields.confirmPassword}</Text>
          <View style={styles.passwordRow}>
            <TextInput
              testID={MOBILE_SELECTORS.confirmPasswordInput}
              accessibilityLabel={t.auth.fields.confirmPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!confirmVisible}
              autoComplete="new-password"
              maxLength={128}
              style={[styles.input, styles.passwordInput]}
            />
            <PasswordVisibility
              visible={confirmVisible}
              onPress={() => setConfirmVisible((v) => !v)}
              label={confirmVisible ? t.common.ui.hidePassword : t.common.ui.showPassword}
            />
          </View>
          <Text style={styles.label}>{s.phoneLabel}</Text>
          <View style={styles.phoneContainer}>
            <Pressable
              testID={MOBILE_SELECTORS.countrySelector}
              onPress={() => setShowCountryMenu((v) => !v)}
              style={styles.countryPickerButton}
              accessibilityLabel={`${s.countryLabel}: ${selectedCountry.name}`}
            >
              <Text style={styles.countryPickerText}>
                {selectedCountry.flag} {selectedCountry.dialCode}
              </Text>
            </Pressable>
            <TextInput
              testID={MOBILE_SELECTORS.phoneInput}
              accessibilityLabel={s.phoneLabel}
              value={phone}
              onChangeText={(val) => setPhone(val.replace(/[^0-9\s\-()]/g, ""))}
              keyboardType="phone-pad"
              maxLength={20}
              placeholder="123 456 789"
              style={[styles.input, styles.phoneInput]}
            />
          </View>
          {showCountryMenu ? (
            <View style={styles.countryDropdown}>
              {COUNTRIES.slice(0, 8).map((c) => (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    setSelectedCountry(c);
                    setShowCountryMenu(false);
                  }}
                  style={styles.countryItem}
                >
                  <Text style={styles.countryItemText}>
                    {c.flag} {c.name} ({c.dialCode})
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {infoMessage ? (
        <Text style={styles.successMessage} accessibilityLiveRegion="polite">
          {infoMessage}
        </Text>
      ) : null}

      <Pressable
        testID={MOBILE_SELECTORS.submitButton}
        accessibilityRole="button"
        accessibilityLabel={
          authMode === "signIn"
            ? t.auth.signIn.submit
            : authMode === "signUp"
              ? t.auth.signUp.submit
              : t.auth.forgot.submit
        }
        disabled={busy || conn !== "connected"}
        onPress={authMode === "signIn" ? onSignIn : authMode === "signUp" ? onSignUp : onForgot}
        style={({ pressed }) => [
          styles.button,
          styles.primary,
          (busy || conn !== "connected") && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>
            {authMode === "signIn"
              ? t.auth.signIn.submit
              : authMode === "signUp"
                ? t.auth.signUp.submit
                : t.auth.forgot.submit}
          </Text>
        )}
      </Pressable>

      <View style={styles.authLinks}>
        {authMode === "signIn" ? (
          <Pressable
            testID={MOBILE_SELECTORS.tabForgot}
            onPress={() => {
              setAuthMode("forgot");
              setError(null);
              setInfoMessage(null);
            }}
          >
            <Text style={styles.linkText}>{t.auth.signIn.forgot}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              setAuthMode("signIn");
              setError(null);
              setInfoMessage(null);
            }}
          >
            <Text style={styles.linkText}>← {t.common.nav.signIn}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const panelCard = signedIn ? (
    <View style={styles.card}>
      <Text testID={MOBILE_SELECTORS.panelSummaryCard} accessibilityRole="summary" style={styles.muted}>
        <Text style={styles.h2}>{summary.user.name}</Text>
        {`\n${summary.user.email} · ${summary.org?.name ?? s.noOrg}\n${t.panel.nav.calendars}: ${summary.calendars.length}`}
      </Text>
      <Pressable
        testID={MOBILE_SELECTORS.signOutButton}
        accessibilityRole="button"
        accessibilityLabel={t.panel.nav.signOut}
        onPress={onSignOut}
        style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryText}>{t.panel.nav.signOut}</Text>
      </Pressable>
    </View>
  ) : null;

  const appointmentsCard = (
    <View style={styles.card}>
      <Text style={styles.h2} accessibilityRole="header">
        {t.booking.my.title}
      </Text>
      {lastDataUpdate && conn === "offline" ? (
        <Text testID={MOBILE_SELECTORS.offlineStatusBanner} style={styles.offlineNotice}>
          {s.offlineStale} {new Date(lastDataUpdate).toLocaleString(lang === "es" ? "es-MX" : "en-US")} (
          {s.offlineSaved})
        </Text>
      ) : null}
      <Text testID={MOBILE_SELECTORS.myAppointmentsList} style={styles.item}>
        {bookings && bookings.length > 0
          ? bookings
              .map(
                (b) => `${new Date(b.start).toLocaleString(lang === "es" ? "es-MX" : "en-US")} · ${b.status}`,
              )
              .join("\n")
          : signedIn
            ? t.booking.my.none
            : t.auth.signIn.title}
      </Text>
      {!signedIn && (
        <Pressable style={[styles.button, styles.primary]} onPress={() => setNavTab("account")}>
          <Text style={styles.primaryText}>{t.common.nav.signIn}</Text>
        </Pressable>
      )}
    </View>
  );

  const onBook = async (target: BookingTarget) => {
    if (!selectedBusiness) return;
    setError(null);
    setInfoMessage(null);
    const picked = bookingFlow.select(selectedBusiness.businessId, target);
    if (!picked.ok) {
      setError(picked.reason === "unavailable" ? s.bookingUnavailable : s.bookingInvalidLink);
      return;
    }
    setBusy(true);
    try {
      const result = await bookingFlow.open();
      if (result.status === "offline") setError(s.bookingOffline);
      else if (result.status === "browser_error") setError(s.bookingBrowserError);
      else if (result.status === "not_confirmed") setInfoMessage(s.bookingNotConfirmed);
      else if (result.status === "unknown") setInfoMessage(s.bookingUnknown);
      else if (result.status === "confirmed") {
        // Confirmada por el servidor: se vuelven a leer sus citas antes de mostrarlas.
        setBookings(await client.myBookings(false));
        setInfoMessage(s.bookingConfirmed);
        setNavTab("appointments");
      }
    } catch {
      setError(s.bookingBrowserError);
    } finally {
      setBusy(false);
    }
  };

  const directoryCard = (
    <View style={styles.card}>
      {selectedBusiness ? (
        <View testID={MOBILE_SELECTORS.businessProfileView} style={styles.profileView}>
          <Pressable
            onPress={() => setSelectedBusiness(null)}
            style={styles.backButton}
            accessibilityLabel={t.public.businessProfile.backToDirectory}
          >
            <Text style={styles.linkText}>← {t.public.businessProfile.backToDirectory}</Text>
          </Pressable>

          <Text style={styles.h2}>{selectedBusiness.displayName}</Text>
          <Text style={styles.badge}>{selectedBusiness.primaryCategory}</Text>
          <Text style={styles.paragraph}>{selectedBusiness.description}</Text>

          <Text style={styles.h3}>{t.public.businessProfile.locations}</Text>
          {selectedBusiness.locations.map((loc) => (
            <View key={loc.id} style={styles.locationItem}>
              <Text style={styles.locationName}>{loc.name}</Text>
              <Text style={styles.locationAddress}>
                {loc.addressVisibility === "public"
                  ? `${loc.address}, ${loc.locality}`
                  : t.public.businessProfile.addressLocalityOnly.replace("{{locality}}", loc.locality)}
              </Text>
            </View>
          ))}

          <Text style={styles.h3}>{t.public.businessProfile.services}</Text>
          {selectedBusiness.bookingTargets && selectedBusiness.bookingTargets.length > 0 ? (
            selectedBusiness.bookingTargets.map((target) => (
              <View key={target.calendarId} style={styles.targetRow}>
                <Text style={styles.targetName}>{target.slug}</Text>
                <Pressable
                  testID={MOBILE_SELECTORS.businessProfileBookButton}
                  style={[styles.button, styles.primary, (busy || !target.reservable) && styles.disabled]}
                  disabled={busy || !target.reservable}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || !target.reservable }}
                  accessibilityLabel={`${t.public.businessProfile.bookService} ${target.slug}`}
                  onPress={() => void onBook(target)}
                >
                  <Text style={styles.primaryText}>{t.public.businessProfile.bookService}</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>{t.public.businessProfile.noServices}</Text>
          )}
        </View>
      ) : (
        <View testID={MOBILE_SELECTORS.directoryList}>
          <Text style={styles.h2} accessibilityRole="header">
            {t.public.directory.title}
          </Text>
          <TextInput
            testID={MOBILE_SELECTORS.directorySearchInput}
            placeholder={t.public.directory.searchPlaceholder}
            value={directorySearch}
            onChangeText={setDirectorySearch}
            style={styles.input}
          />
          <View style={styles.businessList}>
            {directoryItems.map((biz) => (
              <Pressable
                key={biz.businessId}
                testID={MOBILE_SELECTORS.directoryCard}
                onPress={async () => {
                  try {
                    const full = await client.getBusinessProfile(biz.businessId);
                    setSelectedBusiness(full);
                  } catch {}
                }}
                style={styles.businessCard}
              >
                <Text style={styles.businessName}>{biz.displayName}</Text>
                <Text style={styles.businessCategory}>{biz.primaryCategory}</Text>
                <Text style={styles.businessLocality}>{biz.location.locality}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  const ownerProfileCard = summary?.org ? (
    <View style={styles.card}>
      <Text style={styles.h2} accessibilityRole="header">
        {t.panel.businessProfile.title}
      </Text>
      <View style={styles.statusRow}>
        <Text testID={MOBILE_SELECTORS.ownerProfileStatus} style={styles.statusText}>
          {ownerProfile?.status === "published"
            ? t.panel.businessProfile.status.published
            : t.panel.businessProfile.status.draft}
        </Text>
        {ownerProfile?.status === "published" ? (
          <Pressable
            testID={MOBILE_SELECTORS.ownerProfileUnpublishButton}
            onPress={onUnpublish}
            disabled={busy || conn === "offline"}
            style={[styles.button, styles.secondary]}
          >
            <Text style={styles.secondaryText}>{t.panel.businessProfile.unpublishAction}</Text>
          </Pressable>
        ) : (
          <Pressable
            testID={MOBILE_SELECTORS.ownerProfilePublishButton}
            onPress={onPublish}
            disabled={busy || conn === "offline"}
            style={[styles.button, styles.primary]}
          >
            <Text style={styles.primaryText}>{t.panel.businessProfile.publishAction}</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.label}>{t.panel.businessProfile.fields.displayName}</Text>
      <TextInput
        value={ownerDisplayName}
        onChangeText={setOwnerDisplayName}
        maxLength={100}
        style={styles.input}
      />

      <Text style={styles.label}>{t.panel.businessProfile.fields.description}</Text>
      <TextInput
        value={ownerDescription}
        onChangeText={setOwnerDescription}
        multiline
        numberOfLines={3}
        maxLength={5000}
        style={[styles.input, styles.multilineInput]}
      />

      <Pressable
        testID={MOBILE_SELECTORS.ownerProfileSaveButton}
        onPress={onSaveOwnerProfile}
        disabled={busy}
        style={[styles.button, styles.primary]}
      >
        <Text style={styles.primaryText}>{t.panel.businessProfile.fields.save}</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.scroll, layout.isTablet && styles.scrollTablet]}>
        <View style={styles.topHeader}>
          <Text style={styles.h1} accessibilityRole="header">
            {t.common.site.name}
          </Text>

          {/* Selector de idioma con banderas */}
          <View style={styles.langSelectorWrapper}>
            <Pressable
              testID={MOBILE_SELECTORS.languageSelector}
              onPress={() => setShowLangMenu((v) => !v)}
              style={styles.langSelectorButton}
              accessibilityLabel={`Idioma: ${currentLangObj.label}`}
            >
              <Text style={styles.langButtonText}>
                {currentLangObj.flag} {currentLangObj.label} ▾
              </Text>
            </Pressable>
            {showLangMenu && (
              <View style={styles.langDropdown}>
                {MOBILE_LANGUAGES.map((item) => (
                  <Pressable
                    key={item.lang}
                    onPress={() => {
                      setUserLang(item.lang);
                      setShowLangMenu(false);
                    }}
                    style={[styles.langItem, item.lang === lang && styles.langItemActive]}
                  >
                    <Text style={styles.langItemText}>
                      {item.flag} {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Barra de navegación principal */}
        <View style={styles.navBar}>
          <Pressable
            testID={MOBILE_SELECTORS.tabDirectory}
            onPress={() => setNavTab("directory")}
            style={[styles.navTabButton, navTab === "directory" && styles.navTabButtonActive]}
          >
            <Text style={[styles.navTabText, navTab === "directory" && styles.navTabTextActive]}>
              {s.directoryTab}
            </Text>
          </Pressable>
          <Pressable
            testID={MOBILE_SELECTORS.tabMyAppointments}
            onPress={() => setNavTab("appointments")}
            style={[styles.navTabButton, navTab === "appointments" && styles.navTabButtonActive]}
          >
            <Text style={[styles.navTabText, navTab === "appointments" && styles.navTabTextActive]}>
              {s.myAppointmentsTab}
            </Text>
          </Pressable>
          {signedIn && summary?.org ? (
            <Pressable
              testID={MOBILE_SELECTORS.tabBusinessProfile}
              onPress={() => setNavTab("businessProfile")}
              style={[styles.navTabButton, navTab === "businessProfile" && styles.navTabButtonActive]}
            >
              <Text style={[styles.navTabText, navTab === "businessProfile" && styles.navTabTextActive]}>
                {s.businessProfileTab}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            testID={MOBILE_SELECTORS.tabAccount}
            onPress={() => setNavTab("account")}
            style={[styles.navTabButton, navTab === "account" && styles.navTabButtonActive]}
          >
            <Text style={[styles.navTabText, navTab === "account" && styles.navTabTextActive]}>
              {signedIn ? summary.user.name.split(" ")[0] : t.common.nav.signIn}
            </Text>
          </Pressable>
        </View>

        {/* Banners de estado de conexión y cola durable */}
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.banner,
            conn === "offline" ? styles.bannerOff : conn === "connected" && styles.bannerOn,
          ]}
        >
          <Text testID={MOBILE_SELECTORS.statusBanner} style={styles.bannerText}>
            {bannerText}
          </Text>
          <Text style={styles.bannerSub}>
            {apiUrl} · {layout.formFactor} · {lang}
          </Text>
          {pendingOpsCount > 0 && (
            <Text testID={MOBILE_SELECTORS.offlineQueueCounter} style={styles.offlineCounterText}>
              {pendingOpsCount} {s.offlinePending}
            </Text>
          )}
        </View>

        {/* Contenido según pestaña activa y diseño adaptativo */}
        <View style={layout.columns === 2 ? styles.row : undefined}>
          <View style={layout.columns === 2 ? styles.col : undefined}>
            {navTab === "directory" ? directoryCard : null}
            {navTab === "appointments" ? appointmentsCard : null}
            {navTab === "businessProfile" ? ownerProfileCard : null}
            {navTab === "account" ? (signedIn ? panelCard : authCard) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PasswordVisibility({
  visible,
  onPress,
  label,
}: {
  visible: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: visible }}
      onPress={onPress}
      style={styles.passwordToggle}
    >
      <View style={styles.eye}>
        <View style={styles.eyePupil} />
      </View>
      {visible ? <View style={styles.eyeSlash} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7f9" },
  scroll: { padding: 20, paddingTop: 48, gap: 16 },
  scrollTablet: { paddingHorizontal: 48 },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    zIndex: 10,
  },
  h1: { fontSize: 24, fontWeight: "700", color: "#111827", flex: 1 },
  langSelectorWrapper: { position: "relative" },
  langSelectorButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
  },
  langButtonText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  langDropdown: {
    position: "absolute",
    right: 0,
    top: 36,
    width: 140,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 50,
  },
  langItem: { paddingVertical: 8, paddingHorizontal: 12 },
  langItemActive: { backgroundColor: "#eff6ff" },
  langItemText: { fontSize: 13, color: "#1f2937" },
  h2: { fontSize: 20, fontWeight: "600", color: "#111827", marginBottom: 8 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: { borderBottomColor: "#1d4ed8" },
  tabText: { fontSize: 15, fontWeight: "500", color: "#6b7280" },
  tabTextActive: { color: "#1d4ed8", fontWeight: "700" },
  banner: { borderRadius: 10, padding: 12, backgroundColor: "#e5e7eb" },
  bannerOn: { backgroundColor: "#d1fae5" },
  bannerOff: { backgroundColor: "#fee2e2" },
  bannerText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  bannerSub: { fontSize: 12, color: "#4b5563", marginTop: 2 },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  col: { flex: 1 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 8, marginBottom: 16 },
  label: { fontSize: 14, color: "#374151", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
    minHeight: 48,
  },
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1, paddingRight: 48 },
  passwordToggle: {
    position: "absolute",
    right: 0,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  eye: {
    width: 22,
    height: 14,
    borderWidth: 2,
    borderColor: "#4b5563",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  eyePupil: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4b5563" },
  eyeSlash: {
    position: "absolute",
    width: 25,
    height: 2,
    backgroundColor: "#4b5563",
    transform: [{ rotate: "-45deg" }],
  },
  phoneContainer: { flexDirection: "row", gap: 8, alignItems: "center" },
  countryPickerButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 48,
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  countryPickerText: { fontSize: 15, color: "#111827" },
  phoneInput: { flex: 1 },
  countryDropdown: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#fff",
    marginTop: 4,
    paddingVertical: 4,
  },
  countryItem: { paddingVertical: 8, paddingHorizontal: 12 },
  countryItemText: { fontSize: 13, color: "#374151" },
  button: { minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 8 },
  googleButton: { borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#fff" },
  googleText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  primary: { backgroundColor: "#1d4ed8" },
  primaryText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  secondary: { borderWidth: 1, borderColor: "#1d4ed8" },
  secondaryText: { fontSize: 16, fontWeight: "600", color: "#1d4ed8" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  error: { color: "#b91c1c", fontSize: 14, marginTop: 4 },
  successMessage: { color: "#15803d", fontSize: 14, marginTop: 4 },
  authLinks: { marginTop: 12, alignItems: "center" },
  linkText: { color: "#1d4ed8", fontSize: 14, fontWeight: "500" },
  muted: { color: "#4b5563", fontSize: 14 },
  item: { fontSize: 15, color: "#111827", paddingVertical: 4 },
  navBar: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  navTabButton: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 6 },
  navTabButtonActive: { backgroundColor: "#1d4ed8" },
  navTabText: { fontSize: 13, fontWeight: "500", color: "#4b5563" },
  navTabTextActive: { color: "#fff", fontWeight: "700" },
  offlineNotice: {
    fontSize: 12,
    color: "#92400e",
    backgroundColor: "#fef3c7",
    padding: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  offlineCounterText: { fontSize: 12, fontWeight: "600", color: "#b45309", marginTop: 4 },
  profileView: { gap: 8 },
  backButton: { paddingVertical: 4, marginBottom: 4 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#e0e7ff",
    color: "#3730a3",
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paragraph: { fontSize: 14, color: "#374151", lineHeight: 20 },
  h3: { fontSize: 16, fontWeight: "600", color: "#111827", marginTop: 8 },
  locationItem: { backgroundColor: "#f9fafb", padding: 8, borderRadius: 6, marginTop: 4 },
  locationName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  locationAddress: { fontSize: 13, color: "#4b5563", marginTop: 2 },
  targetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  targetName: { fontSize: 14, fontWeight: "500", color: "#111827", flex: 1 },
  businessList: { gap: 8, marginTop: 12 },
  businessCard: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  businessName: { fontSize: 16, fontWeight: "600", color: "#111827" },
  businessCategory: { fontSize: 12, color: "#6b7280" },
  businessLocality: { fontSize: 13, color: "#4b5563" },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusText: { fontSize: 15, fontWeight: "600", color: "#111827" },
  multilineInput: { minHeight: 80, textAlignVertical: "top" },
});
