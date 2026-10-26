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
import { AUTH_NAME_ALLOWED, AUTH_NAME_MAX, AuthName, EmailField } from "../../packages/schemas/dist/index.js";
import {
  COUNTRIES,
  createMobileClient,
  getCatalog,
  MOBILE_LANGUAGES,
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
type AuthMode = "signIn" | "signUp" | "forgot";

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

  // Idioma activo con soporte para los 6 idiomas y banderas
  const [userLang, setUserLang] = useState<MobileLang | null>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Modo de autenticación: entrada, registro o recuperación
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");

  // Campos de formulario
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
    await client.signOut().catch(() => client.setToken(null));
    setSummary(null);
    setBookings(null);
  }, [client]);

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
        <View style={styles.topHeader}>
          <Text style={styles.h1} accessibilityRole="header">
            {t.common.site.name}
          </Text>

          {/* Selector de idioma con banderas (USA para EN, Brasil para PT) */}
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
});
