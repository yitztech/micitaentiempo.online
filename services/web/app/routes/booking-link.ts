import { redirect } from "react-router";
import { bookingLinkTarget } from "~/lib/booking-link";
import { siteForRequest } from "~/lib/site.server";
import type { Route } from "./+types/booking-link";

export function loader({ request, params }: Route.LoaderArgs) {
  const { lang } = siteForRequest(request);
  return redirect(bookingLinkTarget(lang, params.slug, new URL(request.url).search));
}
