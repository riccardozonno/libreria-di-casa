import { spineClass } from "./ui";

// Copertina servita da /api/covers (dietro Access); senza copertina: un "dorso" colorato con l'iniziale.

type Size = "sm" | "lg";

const SIZES: Record<Size, { width: number; height: number; classes: string; text: string }> = {
  sm: { width: 48, height: 72, classes: "h-[72px] w-12 rounded-[6px]", text: "text-[18px]" },
  lg: { width: 128, height: 192, classes: "h-48 w-32 rounded-[10px]", text: "text-[40px]" },
};

interface BookCoverProps {
  bookId: string;
  title: string;
  coverKey: string | null;
  size?: Size;
}

export function BookCover({ bookId, title, coverKey, size = "sm" }: BookCoverProps) {
  const { width, height, classes, text } = SIZES[size];
  if (coverKey) {
    return (
      <img
        src={`/api/covers/${coverKey}`}
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
