import {
  AuthName,
  CancelBooking,
  CancelEvent,
  ConfirmHold,
  ContactMessage,
  CreateCalendar,
  CreateEvent,
  CreateOrg,
  CustomHoliday,
  DateOverride,
  EmailField,
  MobileForgotPassword,
  MobileGoogleAuth,
  MobileSignIn,
  MobileSignUp,
  NewPasswordField,
  NewsletterSignup,
  OtpVerify,
  PasswordField,
  PublicHold,
  Reschedule,
  Service,
  UpdateCalendar,
  UpdateEvent,
  UpdateMe,
  UpdateOrg,
  WeeklyHours,
} from "@mcet/schemas";

export function validateRequest(method: string, path: string, body: unknown): unknown {
  const route = path.split("?")[0] ?? path;
  let schema: { parse: (body: unknown) => unknown } | undefined;
  if (method === "POST" && route === "/api/auth/sign-up/email") {
    const b = body as Record<string, unknown>;
    const res: Record<string, unknown> = { ...b, name: AuthName.parse(b?.name) };
    if (b?.email !== undefined) res.email = EmailField.parse(b.email);
    if (b?.password !== undefined) res.password = NewPasswordField.parse(b.password);
    return res;
  }
  if (method === "POST" && route === "/api/auth/sign-in/email") {
    const b = body as Record<string, unknown>;
    const res: Record<string, unknown> = { ...b };
    if (b?.email !== undefined) res.email = EmailField.parse(b.email);
    if (b?.password !== undefined) res.password = PasswordField.parse(b.password);
    return res;
  }
  if (method === "POST" && route === "/api/auth/request-password-reset") {
    const b = body as Record<string, unknown>;
    const res: Record<string, unknown> = { ...b };
    if (b?.email !== undefined) res.email = EmailField.parse(b.email);
    return res;
  }
  if (method === "POST" && route === "/api/auth/reset-password") {
    const b = body as Record<string, unknown>;
    const res: Record<string, unknown> = { ...b };
    if (b?.newPassword !== undefined) res.newPassword = NewPasswordField.parse(b.newPassword);
    return res;
  }
  if (route === "/api/public/v1/mobile/auth/sign-up" && method === "POST") schema = MobileSignUp;
  if (route === "/api/public/v1/mobile/auth/sign-in" && method === "POST") schema = MobileSignIn;
  if (route === "/api/public/v1/mobile/auth/forgot-password" && method === "POST")
    schema = MobileForgotPassword;
  if (
    (route === "/api/public/v1/mobile/auth/google" || route === "/api/public/v1/google/verify") &&
    method === "POST"
  )
    schema = MobileGoogleAuth;
  if (route === "/api/v1/me" && method === "PATCH") schema = UpdateMe;
  if (route === "/api/v1/org" && method === "POST") schema = CreateOrg;
  if (route === "/api/v1/org" && method === "PATCH") schema = UpdateOrg;
  if (route === "/api/public/v1/newsletter" && method === "POST") schema = NewsletterSignup;
  if (route === "/api/public/v1/contact" && method === "POST") schema = ContactMessage;
  if (route === "/api/public/v1/otp/verify" && method === "POST") schema = OtpVerify;
  if (/^\/api\/public\/v1\/calendars\/[^/]+\/holds$/.test(route) && method === "POST") schema = PublicHold;
  if (/^\/api\/public\/v1\/holds\/[^/]+\/confirm$/.test(route) && method === "POST") schema = ConfirmHold;
  if (/^\/api\/public\/v1\/my\/bookings\/[^/]+\/cancel$/.test(route) && method === "POST")
    schema = CancelBooking;
  if (/^\/api\/public\/v1\/my\/bookings\/[^/]+$/.test(route) && method === "PATCH") schema = Reschedule;
  if (/^\/api\/v1\/calendars\/[^/]+\/hours$/.test(route) && method === "PUT") schema = WeeklyHours;
  if (/^\/api\/v1\/calendars\/[^/]+\/overrides\/[^/]+$/.test(route) && method === "PUT")
    schema = DateOverride;
  if (/^\/api\/v1\/calendars\/[^/]+\/holidays\/custom$/.test(route) && method === "POST")
    schema = CustomHoliday;
  if (route === "/api/v1/calendars" && method === "POST") schema = CreateCalendar;
  if (/^\/api\/v1\/calendars\/[^/]+$/.test(route) && method === "PATCH") schema = UpdateCalendar;
  if (/^\/api\/v1\/calendars\/[^/]+\/services(?:\/[^/]+)?$/.test(route) && ["POST", "PUT"].includes(method))
    schema = Service;
  if (/^\/api\/v1\/calendars\/[^/]+\/events$/.test(route) && method === "POST") schema = CreateEvent;
  if (/^\/api\/v1\/calendars\/[^/]+\/events\/[^/]+$/.test(route) && method === "PATCH") schema = UpdateEvent;
  if (/^\/api\/v1\/calendars\/[^/]+\/events\/[^/]+\/cancel$/.test(route) && method === "POST")
    schema = CancelEvent;
  return schema ? schema.parse(body) : body;
}
