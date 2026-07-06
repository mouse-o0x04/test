import { useCallback, useMemo, useState } from "react";
import { useAuth } from "./useAuth";

export interface ColumnDef {
  key: string;
  title: string;
  alwaysShow?: boolean;
}

interface ColumnState {
  order: string[];
  hidden: string[];
}

const STORAGE_PREFIX = "crm_col_settings_";

export function useColumnSettings(entity: string, defaultColumns: ColumnDef[]) {
  const { user } = useAuth();
  const storageKey = STORAGE_PREFIX + entity + "_" + (user?.id || "guest");

  const [state, setState] = useState<ColumnState>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: ColumnState = JSON.parse(saved);
        const defaultKeys = defaultColumns.map((c) => c.key);
        const validOrder = parsed.order.filter((k) => defaultKeys.includes(k));
        const missing = defaultKeys.filter((k) => !validOrder.includes(k));
        return { order: [...validOrder, ...missing], hidden: parsed.hidden.filter((k) => defaultKeys.includes(k)) };
      }
    } catch { /* ignore */ }
    return { order: defaultColumns.map((c) => c.key), hidden: [] };
  });

  const save = useCallback((s: ColumnState) => {
    setState(s);
    localStorage.setItem(storageKey, JSON.stringify(s));
  }, [storageKey]);

  const isVisible = useCallback((key: string) => {
    const col = defaultColumns.find((c) => c.key === key);
    if (col?.alwaysShow) return true;
    return !state.hidden.includes(key);
  }, [state.hidden, defaultColumns]);

  const toggle = useCallback((key: string) => {
    const col = defaultColumns.find((c) => c.key === key);
    if (col?.alwaysShow) return;
    save({
      ...state,
      hidden: state.hidden.includes(key) ? state.hidden.filter((k) => k !== key) : [...state.hidden, key],
    });
  }, [state, save, defaultColumns]);

  const moveUp = useCallback((key: string) => {
    const idx = state.order.indexOf(key);
    if (idx <= 0) return;
    const newOrder = [...state.order];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    save({ ...state, order: newOrder });
  }, [state, save]);

  const moveDown = useCallback((key: string) => {
    const idx = state.order.indexOf(key);
    if (idx < 0 || idx >= state.order.length - 1) return;
    const newOrder = [...state.order];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    save({ ...state, order: newOrder });
  }, [state, save]);

  const reset = useCallback(() => {
    const fresh: ColumnState = { order: defaultColumns.map((c) => c.key), hidden: [] };
    save(fresh);
  }, [save, defaultColumns]);

  const orderedVisibleKeys = useMemo(
    () => {
      const visible = state.order.filter((k) => isVisible(k));
      const alwaysShowKeys = defaultColumns.filter((c) => c.alwaysShow && !visible.includes(c.key)).map((c) => c.key);
      return [...visible, ...alwaysShowKeys];
    },
    [state.order, isVisible, defaultColumns]
  );

  return { state, isVisible, toggle, moveUp, moveDown, reset, orderedVisibleKeys };
}
