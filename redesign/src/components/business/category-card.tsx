import { Link } from "react-router";
import type { Category } from "@/lib/data";
import { cn } from "@/lib/utils";

const bg = {
  blue: "bg-cat-blue",
  pink: "bg-cat-pink",
  teal: "bg-cat-teal",
  orange: "bg-cat-orange",
  violet: "bg-cat-violet",
  sky: "bg-cat-sky",
  green: "bg-cat-green",
  gray: "bg-cat-gray",
} as const;

export function CategoryCard({ c, className }: { c: Category; className?: string }) {
  const Icon = c.icon;
  return (
    <Link
      to={c.id === "mas" ? "/directorio" : `/directorio?categoria=${c.id}`}
      className={cn(
        "group flex min-h-[118px] flex-col items-center justify-center gap-3 rounded-card p-4 text-center transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-card",
        bg[c.tone],
        className,
      )}
    >
      <Icon
        className={cn("size-9 transition-transform group-hover:scale-110", c.fg)}
        strokeWidth={1.6}
        aria-hidden
      />
      <span className="text-sm font-semibold leading-tight">{c.label}</span>
    </Link>
  );
}
