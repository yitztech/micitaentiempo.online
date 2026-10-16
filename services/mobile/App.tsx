import * as AuthSession from "expo-auth-session";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import {
  createMobileClient,
  getCatalog,
  MOBILE_SELECTORS,
  MOBILE_STRINGS,
  type MobileBootstrapResponse,
  type MobileLang,
  type MobilePanelSummary,
  type MobilePlatform,
  resolveDeviceLayout,
} from "./src/index.ts";

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
type ConnState = "connecting" | "connected" | "offline";

/**
 * App Expo (Android e iOS, teléfonos y tablets). Reutiliza los catálogos @mcet/i18n, la validación
 * del frontend (validateRequest + @mcet/schemas) y se conecta al backend con sesión Bearer.
 */
export default function App() {
  const platform: MobilePlatform = Platform.OS === "ios" ? "ios" : "android";
  const { width, height } = useWindowDimensions();
  const layout = resolveDeviceLayout({ width, height, platform });
  const [apiUrl, setApiUrl] = useState(() => defaultBaseUrl(platform));
  const client = useMemo(() => createMobileClient({ baseUrl: apiUrl, platform }), [apiUrl, platform]);

  const [conn, setConn] = useState<ConnState>("connecting");
  const [boot, setBoot] = useState<MobileBootstrapResponse | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MobilePanelSummary | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  const lang: MobileLang = boot?.lang ?? "es";
  const t = getCatalog(lang);
  const s = MOBILE_STRINGS[lang];

  useEffect(() => {
    let alive = true;
    async function init() {
      try {
        const res = await client.bootstrap();
        if (!alive) return;
        setBoot(res);
        setConn("connected");
      } catch {
        if (platform === "android" && apiUrl.includes("10.0.2.2")) {
          try {
            const fallbackClient = createMobileClient({ baseUrl: "http://127.0.0.1:8080", platform });
            const res = await fallbackClient.bootstrap();
            if (!alive) return;
            setApiUrl("http://127.0.0.1:8080");
            setBoot(res);
            setConn("connected");
            return;
          } catch {}
        }
        if (alive) setConn("offline");
      }
    }
    void init();
    return () => {
      alive = false;
    };
  }, [client, apiUrl, platform]);

  const loadSession = useCallback(async () => {
    const [sum, list] = await Promise.all([client.panelSummary(), client.myBookings(false)]);
    setSummary(sum);
    setBookings(list);
  }, [client]);

  const onSignIn = useCallback(async () => {
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
  }, [client, email, password, loadSession, s.signInError]);

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
    await client.signOut().catch(() => client.setToken(null));
    setSummary(null);
    setBookings(null);
  }, [client]);

  const signedIn = summary !== null;
  const bannerText = conn === "connected" ? s.connected : conn === "offline" ? s.offline : s.connecting;

  const authCard = (
    <View style={styles.card}>
      <Text style={styles.h2} accessibilityRole="header">
        {t.auth.signIn.title}
      </Text>
      <Pressable
        testID={MOBILE_SELECTORS.googleButton}
        accessibilityRole="button"
        accessibilityLabel={t.auth.google}
        onPress={onGoogle}
        style={({ pressed }) => [styles.button, styles.googleButton, pressed && styles.pressed]}
      >
        <Text style={styles.googleText}>{t.auth.google}</Text>
      </Pressable>
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
      <Text style={styles.label}>{t.auth.fields.password}</Text>
      <TextInput
        testID={MOBILE_SELECTORS.passwordInput}
        accessibilityLabel={t.auth.fields.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        maxLength={128}
        style={styles.input}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Pressable
        testID={MOBILE_SELECTORS.submitButton}
        accessibilityRole="button"
        accessibilityLabel={t.auth.signIn.submit}
        disabled={busy || conn !== "connected"}
        onPress={onSignIn}
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
          <Text style={styles.primaryText}>{t.auth.signIn.submit}</Text>
        )}
      </Pressable>
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

  const appointmentsCard = signedIn ? (
    <View style={styles.card}>
      <Text style={styles.h2} accessibilityRole="header">
        {t.booking.my.title}
      </Text>
      <Text testID={MOBILE_SELECTORS.myAppointmentsList} style={styles.item}>
        {bookings && bookings.length > 0
          ? bookings
              .map(
                (b) => `${new Date(b.start).toLocaleString(lang === "es" ? "es-MX" : "en-US")} · ${b.status}`,
              )
              .join("\n")
          : t.booking.my.none}
      </Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.scroll, layout.isTablet && styles.scrollTablet]}>
        <Text style={styles.h1} accessibilityRole="header">
          {t.common.site.name}
        </Text>
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
        </View>
        <View style={layout.columns === 2 ? styles.row : undefined}>
          <View style={layout.columns === 2 ? styles.col : undefined}>{signedIn ? panelCard : authCard}</View>
          {appointmentsCard ? (
            <View style={layout.columns === 2 ? styles.col : undefined}>{appointmentsCard}</View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7f9" },
  scroll: { padding: 20, paddingTop: 48, gap: 16 },
  scrollTablet: { paddingHorizontal: 48 },
  h1: { fontSize: 28, fontWeight: "700", color: "#111827" },
  h2: { fontSize: 20, fontWeight: "600", color: "#111827", marginBottom: 8 },
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
  button: { minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 8 },
  googleButton: { borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#fff" },
  googleText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  primary: { backgroundColor: "#1d4ed8" },
  primaryText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  secondary: { borderWidth: 1, borderColor: "#1d4ed8" },
  secondaryText: { fontSize: 16, fontWeight: "600", color: "#1d4ed8" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  error: { color: "#b91c1c", fontSize: 14 },
  muted: { color: "#4b5563", fontSize: 14 },
  item: { fontSize: 15, color: "#111827", paddingVertical: 4 },
});
