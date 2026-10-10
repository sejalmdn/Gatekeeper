import { useEffect, useState } from "react";
import { messageFor } from "../utils/format";

// Read state shared by list and detail screens.
export interface LoadState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

// Load a mounted route's data and ignore responses after it unmounts.
export function useLoad<T>(load: () => Promise<T>): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ loading: true });
  useEffect(() => {
    let active = true;
    void load()
      .then((data) => active && setState({ data, loading: false }))
      .catch((error: unknown) => {
        if (active) {
          setState({ error: messageFor(error), loading: false });
        }
      });
    return () => {
      active = false;
    };
  }, []);
  return state;
}
