import { data } from "react-router";
import { apiGet } from "./api.server";
import type { PublicCalendar } from "./booking-types";

/** Perfil público del tablero o 404. */
export async function loadPublicCalendar(
  request: Request,
  slug: string | undefined,
): Promise<PublicCalendar> {
  if (!slug || !/^[a-z0-9-]{3,70}$/.test(slug)) throw data(null, { status: 404 });
  const res = await apiGet<PublicCalendar>(request, `/api/public/v1/calendars/${slug}`);
  if (res.status !== 200 || !res.body) throw data(null, { status: res.status === 404 ? 404 : 502 });
  return res.body;
}
