import { Switch as S } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full bg-field transition-colors data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
    </S.Root>
  );
}
