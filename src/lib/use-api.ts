import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api";

// Lettura dall'API legata a un percorso: ricarica quando cambia il percorso o con `reload()`.
// I dati della richiesta precedente restano visibili mentre arriva la nuova (niente sfarfallii).

interface ApiState<T> {
  key: string | null;
  data?: T;
  error?: string;
}

export function useApi<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const key = path === null ? null : `${path}#${version}`;
  const [state, setState] = useState<ApiState<T>>({ key: null });

  useEffect(() => {
    if (key === null || path === null) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => setState({ key, data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState((previous) => ({ key, data: previous.data, error: errorMessage(error) }));
      });
    return () => controller.abort();
  }, [key, path]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const isCurrent = state.key === key;
  return { data: state.data, error: isCurrent ? state.error : undefined, loading: !isCurrent, reload };
}
