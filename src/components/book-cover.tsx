import { spineClass } from "./ui";

// Copertina servita da /api/covers (richiede sessione); senza copertina: un "dorso" colorato con l'iniziale.

type Size = "sm" | "lg";

const SIZES: Record<Size, { width: number; height: number; classes: string; text: string }> = {
  sm: { width: 48, height: 72, classes: "h-[72px] w-12 rounded-[6px]", text: "text-[18px]" },
  lg: { width: 128, height: 192, classes: "h-48 w-32 rounded-[10px]", text: "text-[40px]" },
};

export function BookCover({ bookId, title, coverPath, size = "sm" }: { bookId: string; title: string; coverPath: string | null; size?: Size }) {
  const { width, height, classes, text } = SIZES[size];
  if (coverPath) {
    return (
      // Già WebP ≤ 600 px ricodificata dal server e servita con cache privata: next/image non aggiungerebbe nulla.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/covers/${coverPath}`}
        alt=""
        width={width}
        height={height}
        loading={size === "lg" ? "eager" : "lazy"}
        decoding="async"
        className={`${classes} shrink-0 bg-sunken object-cover shadow-[var(--shadow-card)]`}
      />
    );
  }
  return (
    <div aria-hidden className={`${classes} ${spineClass(bookId)} flex shrink-0 items-center justify-center shadow-[var(--shadow-card)]`}>
      <span className={`font-serif font-semibold text-white/90 ${text}`}>{title.trim().charAt(0).toUpperCase()}</span>
    </div>
  );
}
