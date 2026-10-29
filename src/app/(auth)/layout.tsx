import type { ReactNode } from "react";

// Pagine pubbliche (accesso, impostazione password): colonna centrata, niente navigazione.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        {/* Icona statica già dimensionata: next/image non serve. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="rounded-[12px] shadow-[var(--shadow-card)]" />
        <div>
          <p className="text-[20px] font-bold tracking-tight">HOME LIBRARY</p>
          <p className="text-[14px] text-ink-faint">I libri di casa, in ogni sede.</p>
        </div>
      </div>
      {children}
    </main>
  );
}
