"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api-client";

type State<T> = { data: T | null; error: ApiError | null; loading: boolean };

/** Load data on mount. `reload` fetches again without clearing what is already on screen. */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetcher(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const apiError =
          error instanceof ApiError ? error : new ApiError("Something went wrong. Please try again.", 0, "unknown");
        setState((previous) => ({ data: previous.data, error: apiError, loading: false }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
