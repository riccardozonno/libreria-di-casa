import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { locationColorClass, locationColorLabel, nextFreeColor, type LocationColorKey } from "@/lib/location-colors";
import { requireUser } from "@/server/actor";
import { listLocations } from "@/server/locations/service";
import { can } from "@/server/policy";
import { CreateLocationForm, LocationAdminControls } from "./location-forms";

export const metadata: Metadata = { title: "Sedi" };

export default async function LocationsPage() {
  const user = await requireUser();
  const locations = await listLocations();
  const canManage = can(user, { type: "location.manage" });
  const usedBy: Partial<Record<LocationColorKey, string>> = Object.fromEntries(locations.map((location) => [location.color, location.name]));
  const suggestedColor = nextFreeColor(locations.map((location) => location.color));

  return (
    <>
      <PageHeader title="Sedi" subtitle={`${locations.length} ${locations.length === 1 ? "sede" : "sedi"}`} />
      {locations.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-surface px-5 py-8 text-center text-[15px] text-ink-soft shadow-[var(--shadow-card)]">
          {canManage ? "Crea la prima sede, per esempio la casa in cui vivi." : "Non ci sono ancora sedi."}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]">
          {locations.map((location) => (
            <li key={location.id} className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span
                  role="img"
                  aria-label={`Colore ${locationColorLabel(location.color)}`}
                  className={`h-10 w-2.5 shrink-0 rounded-full ${locationColorClass(location.color)} ${location.archived ? "opacity-40" : ""}`}
                />
                <Link href={`/?sede=${location.id}`} className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold [overflow-wrap:anywhere]">
                    {location.name}
                    {location.archived && <span className="ml-2 text-[13px] font-medium text-ink-faint">archiviata</span>}
                  </p>
                  <p className="text-[14px] text-ink-faint">
                    {location.copyCount} {location.copyCount === 1 ? "copia" : "copie"}
                    {user.editorLocationIds.has(location.id) && user.role === "EDITOR" && " · puoi modificarla"}
                  </p>
                </Link>
              </div>
              {canManage && <LocationAdminControls location={location} usedBy={usedBy} />}
            </li>
          ))}
        </ul>
      )}
      {canManage && <CreateLocationForm usedBy={usedBy} suggestedColor={suggestedColor} />}
    </>
  );
}
