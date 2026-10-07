export type Role = "owner" | "editor" | "observer";

export interface Me {
  id: string;
  name: string;
  email: string;
  timezone: string;
}

export interface Org {
  id: string;
  name: string;
  plan: "personal" | "branches";
  status: string;
  trialEndsAt: string | null;
  limits: { calendars: number; members: number };
}

export interface BoardView {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  capacity: number;
  country: string | null;
  subdivision: string | null;
  address: string | null;
  embedPolicy: { mode: "any" | "allowlist"; origins: string[] };
  cancelMinNoticeMinutes: number;
  status: string;
  orgStatus: string;
  role: Role;
}

export interface ServiceView {
  id: string;
  name: Record<string, string>;
  description: Record<string, string>;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
  slotStepMin: number;
  dailyLimit: number;
  color: string;
  active: boolean;
}

export interface EventView {
  id: string;
  calendarId: string;
  kind: "appointment" | "block";
  status: "held" | "confirmed" | "cancelled";
  start: string;
  end: string;
  serviceId: string | null;
  title: string | null;
  customerUserId: string | null;
  attendee: {
    name: string | null;
    email: string | null;
    phone: string | null;
    timezone: string | null;
  } | null;
  customerNotes: string | null;
  internalNotes: string | null;
  attendance: string | null;
  version: number;
  recurrence: { seriesId: string; rrule: string | null; recurrenceId: string; isException: boolean } | null;
}

export interface ScheduleView {
  shifts: Array<{
    weekday: number;
    kind: "open" | "break";
    range: { start: string; end: string };
    label?: string;
  }>;
  holidayPolicies: Array<{ country: string; subdivision?: string; types: string[]; substitutes: boolean }>;
}

export const canWrite = (r: Role) => r === "owner" || r === "editor";
