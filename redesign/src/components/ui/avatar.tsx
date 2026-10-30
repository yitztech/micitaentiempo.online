import { avatarUrl } from "@/lib/assets";
import { cn } from "@/lib/utils";

export function Avatar({ slug, name, className }: { slug: string; name: string; className?: string }) {
  return (
    <img
      src={avatarUrl(slug)}
      alt={name}
      loading="lazy"
      decoding="async"
      width={64}
      height={64}
      className={cn("size-10 shrink-0 rounded-full bg-primary-50 object-cover", className)}
    />
  );
}
