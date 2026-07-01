import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";

export function useViewMode(entity: string, defaultValue: string) {
  const { user } = useAuth();
  const key = `viewMode_${entity}_${user?.id || "guest"}`;

  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem(key) || defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback((v: string) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  }, [key]);

  return [value, set] as const;
}
