import { interpolate, type Lang, noticesEn, noticesEs } from "@mcet/i18n";

export const NOTICES: Record<Lang, typeof noticesEs> = { es: noticesEs, en: noticesEn };

/** Parámetros de un aviso; se guardan sin traducir y se escriben en el idioma de cada destinatario. */
export interface NoticeParams {
  type: string;
  calendarId?: string;
  calendar?: string;
  slug?: string;
  address?: string | null;
  service?: string | null;
  customer?: string | null;
  title?: string | null;
  start?: string;
  end?: string;
  timezone?: string;
  reason?: string | null;
  channel?: string;
  days?: number;
}

export function when(lang: Lang, iso: string | undefined, tz: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Texto del aviso para el personal (panel, correo, Telegram, Slack, WhatsApp). */
export function staffText(lang: Lang, p: NoticeParams, tz: string): string {
  const t = NOTICES[lang];
  const tpl = (t.staff as Record<string, string>)[p.type] ?? t.staff["event.updated"];
  return interpolate(tpl, {
    customer: p.customer || t.someone,
    service: p.service || t.service,
    calendar: p.calendar ?? "",
    title: p.title || p.customer || t.untitled,
    when: when(lang, p.start, tz),
    channel: (t.channels as Record<string, string>)[p.channel ?? ""] ?? p.channel ?? "",
    days: p.days ?? "",
  });
}

/** Asunto y texto para el cliente final. */
export function customerText(lang: Lang, p: NoticeParams, tz: string): { subject: string; text: string } {
  const t = NOTICES[lang];
  const vars = { service: p.service || t.service, calendar: p.calendar ?? "", when: when(lang, p.start, tz) };
  return {
    subject: interpolate((t.subjects as Record<string, string>)[p.type] ?? t.subjects.staff, vars),
    text: interpolate((t.customer as Record<string, string>)[p.type] ?? "", vars),
  };
}
