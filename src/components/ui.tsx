import { useId, type ComponentPropsWithoutRef, type ComponentPropsWithRef, type ReactNode } from "react";
import { locationColorClass, type LocationColorKey } from "../../shared/location-colors";

// Componenti di base condivisi (niente stato; TextField e TextArea usano useId per id univoci).

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink shadow-[var(--shadow-card)] active:opacity-85",
  secondary: "bg-surface text-ink border border-line active:bg-sunken",
  ghost: "text-accent active:bg-accent-soft",
  danger: "bg-danger-soft text-danger active:opacity-85",
};

export function buttonClasses(variant: ButtonVariant = "primary", extra = ""): string {
  return [
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 text-[15px] font-semibold",
    "transition-[opacity,background-color] duration-[var(--duration-fast)] disabled:opacity-50",
    VARIANT_CLASSES[variant],
    extra,
  ].join(" ");
}

// Con ref (React 19 la passa come prop): serve a riportare il focus sul pulsante che ha aperto un modulo.
type ButtonProps = ComponentPropsWithRef<"button"> & { variant?: ButtonVariant };

export function Button({ variant = "primary", className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...rest} />;
}

type FieldProps = ComponentPropsWithoutRef<"input"> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};

export function TextField({ label, name, error, hint, id, className = "", ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? `campo-${name}-${autoId}`;
  const describedBy = [error ? `${inputId}-errore` : null, hint ? `${inputId}-nota` : null].filter(Boolean).join(" ");
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-soft">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-[16px] text-ink placeholder:text-ink-faint aria-[invalid=true]:border-danger"
        {...rest}
      />
      {hint && !error && (
        <p id={`${inputId}-nota`} className="text-[13px] text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-errore`} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Menu a tendina con freccia disegnata da noi: con l'aspetto nativo Safari su iPhone ignora l'altezza
 * minima (44 px) e lo disegna più basso.
 */
export function SelectInput({ className = "", children, ...rest }: ComponentPropsWithoutRef<"select">) {
  return (
    <div className={`relative ${className}`}>
      <select
        className="min-h-11 w-full appearance-none rounded-[var(--radius-sm)] border border-line bg-surface py-2 pl-3 pr-10 text-[16px] text-ink aria-[invalid=true]:border-danger"
        {...rest}
      >
        {children}
      </select>
      <svg viewBox="0 0 20 20" aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-ink-soft">
        <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

type SelectFieldProps = ComponentPropsWithoutRef<"select"> & { label: string; name: string; error?: string; hint?: string };

/** Menu a tendina nativo (sul telefono apre il selettore del sistema), stesso aspetto di TextField. */
export function SelectField({ label, name, error, hint, id, className = "", children, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? `campo-${name}-${autoId}`;
  const describedBy = [error ? `${selectId}-errore` : null, hint ? `${selectId}-nota` : null].filter(Boolean).join(" ");
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={selectId} className="text-[13px] font-semibold text-ink-soft">
        {label}
      </label>
      <SelectInput id={selectId} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy || undefined} {...rest}>
        {children}
      </SelectInput>
      {hint && !error && (
        <p id={`${selectId}-nota`} className="text-[13px] text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${selectId}-errore`} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type TextAreaProps = ComponentPropsWithoutRef<"textarea"> & { label: string; name: string; error?: string };

export function TextArea({ label, name, error, id, ...rest }: TextAreaProps) {
  const autoId = useId();
  const inputId = id ?? `campo-${name}-${autoId}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-soft">
        {label}
      </label>
      <textarea
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-errore` : undefined}
        className="min-h-24 rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-[16px] text-ink"
        {...rest}
      />
      {error && (
        <p id={`${inputId}-errore`} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type NoticeTone = "error" | "success" | "info";

const NOTICE_CLASSES: Record<NoticeTone, string> = {
  error: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
  info: "bg-accent-soft text-ink",
};

export function Notice({ tone = "info", children }: { tone?: NoticeTone; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-[var(--radius-sm)] px-3 py-2.5 text-[14px] font-medium ${NOTICE_CLASSES[tone]}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 pb-4 pt-6">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-ink-faint">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Classi statiche (niente style inline: la CSP non ammette 'unsafe-inline').
const SPINE_CLASSES = [
  "bg-[var(--spine-1)]",
  "bg-[var(--spine-2)]",
  "bg-[var(--spine-3)]",
  "bg-[var(--spine-4)]",
  "bg-[var(--spine-5)]",
  "bg-[var(--spine-6)]",
  "bg-[var(--spine-7)]",
] as const;

/** Colore "dorso" stabile per le copertine segnaposto (le sedi hanno invece un colore scelto dall'admin). */
export function spineClass(locationId: string): string {
  let hash = 0;
  for (const char of locationId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SPINE_CLASSES[hash % SPINE_CLASSES.length] ?? SPINE_CLASSES[0];
}

export function LocationTag({ color, name, count }: { color: LocationColorKey; name: string; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken py-1 pl-1.5 pr-2.5 text-[12px] font-medium text-ink-soft">
      <span aria-hidden className={`h-3.5 w-1.5 rounded-full ${locationColorClass(color)}`} />
      {name}
      {count !== undefined && count > 1 && <span className="text-ink-faint">×{count}</span>}
    </span>
  );
}
