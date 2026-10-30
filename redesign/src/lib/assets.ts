import isotipo from "@/assets/branding/isotipo.svg";
import logo from "@/assets/branding/logo-horizontal.svg";
import logoDark from "@/assets/branding/logo-horizontal-dark.svg";
import ctaGlow from "@/assets/decorations/cta-glow.svg";
import heroGlow from "@/assets/decorations/hero-glow.svg";
import sparkle from "@/assets/decorations/sparkle.svg";
import hero480 from "@/assets/images/hero/hero-profesional-480.webp";
import hero960 from "@/assets/images/hero/hero-profesional-960.webp";
import neg640 from "@/assets/images/professionals/negocio-tablet-640.webp";
import neg1100 from "@/assets/images/professionals/negocio-tablet-1100.webp";

const avatarFiles = import.meta.glob("@/assets/images/avatars/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Avatar por slug (`laura-torres`). */
export function avatarUrl(slug: string): string {
  const hit = Object.entries(avatarFiles).find(([k]) => k.endsWith(`/${slug}.svg`));
  return hit ? hit[1] : (Object.values(avatarFiles)[0] ?? "");
}

export const assets = {
  logo,
  logoDark,
  isotipo,
  sparkle,
  heroGlow,
  ctaGlow,
  hero: { src: hero960, srcSet: `${hero480} 480w, ${hero960} 960w`, width: 960, height: 931 },
  negocio: { src: neg1100, srcSet: `${neg640} 640w, ${neg1100} 1100w`, width: 1100, height: 704 },
};
