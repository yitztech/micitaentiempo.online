import { type ChangeEvent, type ComponentProps, useId, useState } from "react";
import { useRoot, useT } from "~/lib/i18n";

export interface CountryCallingCode {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  flag: string;
  dialCode: string; // E.164 dial prefix, e.g. "+34"
}

export const COUNTRIES: CountryCallingCode[] = [
  { code: "ES", name: "España", flag: "🇪🇸", dialCode: "+34" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸", dialCode: "+1" },
  { code: "BR", name: "Brasil", flag: "🇧🇷", dialCode: "+55" },
  { code: "FR", name: "Francia", flag: "🇫🇷", dialCode: "+33" },
  { code: "DE", name: "Alemania", flag: "🇩🇪", dialCode: "+49" },
  { code: "IT", name: "Italia", flag: "🇮🇹", dialCode: "+39" },
  { code: "MX", name: "México", flag: "🇲🇽", dialCode: "+52" },
  { code: "CO", name: "Colombia", flag: "🇨🇴", dialCode: "+57" },
  { code: "AR", name: "Argentina", flag: "🇦🇷", dialCode: "+54" },
  { code: "CL", name: "Chile", flag: "🇨🇱", dialCode: "+56" },
  { code: "PE", name: "Perú", flag: "🇵🇪", dialCode: "+51" },
  { code: "GB", name: "Reino Unido", flag: "🇬🇧", dialCode: "+44" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", dialCode: "+351" },
  { code: "CA", name: "Canadá", flag: "🇨🇦", dialCode: "+1" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨", dialCode: "+593" },
  { code: "GT", name: "Guatemala", flag: "🇬🇹", dialCode: "+502" },
  { code: "CR", name: "Costa Rica", flag: "🇨🇷", dialCode: "+506" },
  { code: "PA", name: "Panamá", flag: "🇵🇦", dialCode: "+507" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾", dialCode: "+598" },
];

/** Intenta deducir el país y el número local a partir de un string E.164 */
function parsePhoneNumber(fullPhone: string | undefined): { countryCode: string; localNumber: string } {
  if (!fullPhone) return { countryCode: "ES", localNumber: "" };
  const clean = fullPhone.trim();
  // Busca el país que coincida con el prefijo más largo
  const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const c of sorted) {
    if (clean.startsWith(c.dialCode)) {
      return { countryCode: c.code, localNumber: clean.slice(c.dialCode.length).replace(/\D/g, "") };
    }
  }
  return { countryCode: "ES", localNumber: clean.replace(/\D/g, "") };
}

export interface PhoneFieldProps extends Omit<ComponentProps<"input">, "onChange" | "value"> {
  label: string;
  value?: string;
  onChange?: (e: { target: { name?: string; value: string } }) => void;
  hint?: string;
  error?: string;
  optional?: boolean;
}

export function PhoneField({
  label,
  value,
  onChange,
  hint,
  error,
  optional,
  className,
  name,
  required,
  ...props
}: PhoneFieldProps) {
  const id = useId();
  const t = useT();
  const { site } = useRoot();

  // Elegir país por defecto según el idioma del sitio
  const defaultCountry =
    site.lang === "en"
      ? "US"
      : site.lang === "pt"
        ? "BR"
        : site.lang === "fr"
          ? "FR"
          : site.lang === "de"
            ? "DE"
            : site.lang === "it"
              ? "IT"
              : "ES";

  const parsed = parsePhoneNumber(value);
  const [selectedCountryCode, setSelectedCountryCode] = useState(
    COUNTRIES.some((c) => c.code === parsed.countryCode) ? parsed.countryCode : defaultCountry,
  );
  const [localNumber, setLocalNumber] = useState(parsed.localNumber);

  function emitChange(cCode: string, num: string) {
    const currentCountry = COUNTRIES.find((c) => c.code === cCode) ?? (COUNTRIES[0] as CountryCallingCode);
    const cleanNum = num.replace(/\D/g, "");
    const fullValue = cleanNum ? `${currentCountry.dialCode}${cleanNum}` : "";
    onChange?.({ target: { name, value: fullValue } });
  }

  function handleCountryChange(e: ChangeEvent<HTMLSelectElement>) {
    const newCode = e.target.value;
    setSelectedCountryCode(newCode);
    emitChange(newCode, localNumber);
  }

  function handleNumberChange(e: ChangeEvent<HTMLInputElement>) {
    // Permitir SOLO números: eliminar cualquier carácter no numérico
    const digitsOnly = e.target.value.replace(/\D/g, "");
    setLocalNumber(digitsOnly);
    emitChange(selectedCountryCode, digitsOnly);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Teclas de control permitidas
    if (
      e.key === "Backspace" ||
      e.key === "Tab" ||
      e.key === "Delete" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "Home" ||
      e.key === "End" ||
      e.key === "Enter" ||
      e.ctrlKey ||
      e.metaKey
    ) {
      return;
    }
    // Si no es un dígito del 0 al 9, bloquear la tecla
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  }

  const describedBy =
    [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[15px] font-medium">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">({t.common.ui.optional})</span> : null}
      </label>
      <div className="mt-1.5 flex gap-2">
        {/* Selector de país */}
        <div className="relative shrink-0">
          <label htmlFor={`${id}-country`} className="sr-only">
            País e indicativo telefónico
          </label>
          <select
            id={`${id}-country`}
            value={selectedCountryCode}
            onChange={handleCountryChange}
            aria-label="Selector de país"
            className="flex min-h-11 cursor-pointer appearance-none items-center rounded-[var(--radius-field)] border border-border-field bg-surface py-2 pl-3 pr-8 text-[15px] text-text hover:bg-surface-2 focus:border-primary focus:outline-none focus-visible:outline-3 focus-visible:outline-primary"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.dialCode} ({c.name})
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted">
            ▼
          </span>
        </div>

        {/* Input numérico de teléfono */}
        <div className="relative min-w-0 flex-1">
          <input
            {...props}
            id={id}
            name={name}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            minLength={6}
            maxLength={14}
            value={localNumber}
            onChange={handleNumberChange}
            onKeyDown={handleKeyDown}
            required={required}
            placeholder="612345678"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="block min-h-11 w-full rounded-[var(--radius-field)] border border-border-field bg-surface px-3 text-base text-text placeholder:text-muted/60 focus:border-primary focus:outline-none focus-visible:outline-3 focus-visible:outline-primary aria-[invalid=true]:border-danger"
          />
        </div>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
