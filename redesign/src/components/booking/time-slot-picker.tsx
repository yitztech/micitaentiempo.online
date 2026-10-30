import { cn } from "@/lib/utils";

/** Selector de horario: grupo de botones con estado de selección (teclado y lector de pantalla). */
export function TimeSlotPicker({
  slots,
  value,
  onChange,
  taken = [],
  label = "Horarios disponibles",
}: {
  slots: string[];
  value: string | null;
  onChange: (v: string) => void;
  taken?: string[];
  label?: string;
}) {
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-3 gap-2 border-0 p-0 sm:grid-cols-4">
      <legend className="sr-only">{label}</legend>
      {slots.map((s) => {
        const off = taken.includes(s);
        return (
          <button
            key={s}
            type="button"
            disabled={off}
            aria-pressed={value === s}
            onClick={() => onChange(s)}
            className={cn(
              "h-11 rounded-field border text-sm font-semibold tabular-nums transition-colors",
              value === s
                ? "border-primary bg-primary text-white"
                : "border-line bg-white hover:border-primary hover:bg-primary-50",
              off &&
                "cursor-not-allowed border-dashed text-muted/60 line-through hover:border-line hover:bg-white",
            )}
          >
            {s}
          </button>
        );
      })}
    </fieldset>
  );
}
