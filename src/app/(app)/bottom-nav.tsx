"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Barra di navigazione inferiore in stile iOS: target ≥ 44 px, voce attiva annunciata.

const ICON_PROPS = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const icons: Record<string, ReactNode> = {
  catalogo: (
    <svg {...ICON_PROPS}>
      <path d="M4 19V6a1 1 0 0 1 1-1h3v14H5a1 1 0 0 1-1-1Z" />
      <path d="M8 5h4v14H8z" />
      <path d="m14.5 6.5 3.4-1 3.1 12.6-3.4.9z" />
    </svg>
  ),
  aggiungi: (
    <svg {...ICON_PROPS}>
      <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M8 8v8M11 8v8M14 8v8M16.5 8v8" />
    </svg>
  ),
  sedi: (
    <svg {...ICON_PROPS}>
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-5h4v5" />
    </svg>
  ),
  admin: (
    <svg {...ICON_PROPS}>
      <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  profilo: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  ),
};

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof icons;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/libri");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({ canAdd, isAdmin }: { canAdd: boolean; isAdmin: boolean }) {
  const pathname = usePathname();
  const items: NavItem[] = [
    { href: "/", label: "Catalogo", icon: "catalogo" },
    ...(canAdd ? [{ href: "/aggiungi", label: "Aggiungi", icon: "aggiungi" } as const] : []),
    { href: "/sedi", label: "Sedi", icon: "sedi" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "admin" } as const] : []),
    { href: "/profilo", label: "Profilo", icon: "profilo" },
  ];

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <ul className="mx-auto flex h-[var(--nav-height)] max-w-2xl items-stretch justify-around">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-accent" : "text-ink-faint"}`}
              >
                {icons[item.icon]}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
