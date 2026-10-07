/** Perfil público de un tablero (GET /api/public/v1/calendars/:slug). */
export interface PublicCalendar {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  address: string | null;
  bookable: boolean;
  embedPolicy: { mode: "any" | "allowlist"; origins: string[] };
  cancelMinNoticeMinutes: number;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMin: number;
    color: string | null;
  }>;
}

export interface Booking {
  id: string;
  calendarId: string;
  status: string;
  start: string;
  end: string;
  serviceId: string | null;
  name: string | null;
  notes: string | null;
  holdExpiresAt: string | null;
  version: number;
}

export interface MyBooking extends Booking {
  calendar: { name: string; slug: string; timezone: string; address: string | null } | null;
  service: string | null;
  cancelMinNoticeMinutes: number;
}

const compact = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Enlaces «Añadir a Google Calendar» y «Añadir a Outlook» (sin datos de la cuenta). */
export function calendarLinks(b: { start: string; end: string; title: string; location?: string | null }) {
  const g = new URLSearchParams({
    action: "TEMPLATE",
    text: b.title,
    dates: `${compact(b.start)}/${compact(b.end)}`,
  });
  if (b.location) g.set("location", b.location);
  const o = new URLSearchParams({
    subject: b.title,
    startdt: b.start,
    enddt: b.end,
    path: "/calendar/action/compose",
    rru: "addevent",
  });
  if (b.location) o.set("location", b.location);
  return {
    google: `https://calendar.google.com/calendar/render?${g}`,
    outlook: `https://outlook.live.com/calendar/0/action/compose?${o}`,
  };
}
