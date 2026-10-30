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
  /** Falso finché non è arrivato il primo elenco (per non mostrare moduli con dati incompleti). */
  loaded: boolean;
  reload: () => void;
}

const LocationsContext = createContext<LocationsState>({ locations: [], loaded: false, reload: () => undefined });

export function LocationsProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useApi<LocationSummary[]>("/locations");
  return <LocationsContext.Provider value={{ locations: data ?? [], loaded: data !== undefined, reload }}>{children}</LocationsContext.Provider>;
}

export function useLocations(): LocationsState {
  return useContext(LocationsContext);
}
