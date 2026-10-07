import { interpolate, type Lang } from "@mcet/i18n";
import type { RootData } from "./i18n";
import { formatDateTime } from "./time";

export interface NoticeItem {
  id: string;
  type: string;
  params: {
    calendar?: string;
    customer?: string | null;
    service?: string | null;
    title?: string | null;
    start?: string;
    timezone?: string;
    channel?: string;
  };
  readAt: string | null;
  createdAt: string;
}

/** Texto de un aviso del panel en el idioma de la página (mismo catálogo que los correos). */
export function noticeText(t: RootData["t"], lang: Lang, n: NoticeItem, tz: string): string {
  const c = t.notices;
  const tpl = (c.staff as Record<string, string>)[n.type] ?? c.staff["event.updated"];
  const p = n.params;
  return interpolate(tpl, {
    customer: p.customer || c.someone,
    service: p.service || c.service,
    calendar: p.calendar ?? "",
    title: p.title || p.customer || c.untitled,
    when: p.start ? formatDateTime(p.start, lang, p.timezone || tz) : "",
    channel: (c.channels as Record<string, string>)[p.channel ?? ""] ?? p.channel ?? "",
  });
}
