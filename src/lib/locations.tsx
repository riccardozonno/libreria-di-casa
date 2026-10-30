import { createContext, type ReactNode, useContext } from "react";
import type { LocationColorKey } from "../../shared/location-colors";
import { useApi } from "./use-api";

// Sedi caricate una volta e condivise (servono a catalogo, aggiunta, scheda e permessi).

export interface LocationSummary {
  id: string;
  name: string;
  color: LocationColorKey;
  archived: boolean;
  copyCount: number;
}

interface LocationsState {
  locations: LocationSummary[];
  reload: () => void;
}

const LocationsContext = createContext<LocationsState>({ locations: [], reload: () => undefined });

export function LocationsProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useApi<LocationSummary[]>("/locations");
  return <LocationsContext.Provider value={{ locations: data ?? [], reload }}>{children}</LocationsContext.Provider>;
}

export function useLocations(): LocationsState {
  return useContext(LocationsContext);
}
