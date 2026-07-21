import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getColumnState, saveColumnState } from "../api/columnState";

export function useColumnState(entity: string) {
  const queryClient = useQueryClient();
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestWidthsRef = useRef<Record<string, number>>({});
  const lastSyncedRef = useRef<string>("");

  const { data: saved } = useQuery({
    queryKey: ["columnState", entity],
    queryFn: () => getColumnState(entity),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, number>) => saveColumnState(entity, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["columnState", entity] }); },
  });

  useEffect(() => {
    if (saved) {
      const key = JSON.stringify(saved);
      if (key !== lastSyncedRef.current) {
        lastSyncedRef.current = key;
        const next = { ...saved };
        setWidths(next);
        latestWidthsRef.current = next;
        setLoaded(true);
      }
    }
  }, [saved]);

  const flushSave = useCallback((next: Record<string, number>) => {
    latestWidthsRef.current = next;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMutation.mutate(next);
    }, 500);
  }, [saveMutation]);

  const setWidth = useCallback((key: string, width: number) => {
    const next = { ...latestWidthsRef.current, [key]: Math.max(40, Math.round(width)) };
    setWidths(next);
    flushSave(next);
  }, [flushSave]);

  return { widths, setWidth, loaded };
}

export function applyColumnWidths<T extends Record<string, unknown>>(
  columns: T[],
  widths: Record<string, number>,
  setWidth: (key: string, width: number) => void
): T[] {
  return columns.map((col) => {
    const key = String(col.key ?? "");
    if (!key) return col;

    const resizable = (col as Record<string, unknown>).resizable !== false;
    const defaultWidth = (col.width as number) ?? 150;
    const width = resizable ? (widths[key] ?? defaultWidth) : defaultWidth;

    const prevOnHeaderCell = col.onHeaderCell as (() => Record<string, unknown>) | undefined;
    const prevOnCell = (col as Record<string, unknown>).onCell as
      | ((record: unknown, index: number) => Record<string, unknown>)
      | undefined;

    if (!resizable) {
      return {
        ...col,
        onHeaderCell: () => ({
          ...(prevOnHeaderCell ? prevOnHeaderCell() : {}),
        }),
      } as T;
    }

    return {
      ...col,
      width,
      onHeaderCell: () => ({
        ...(prevOnHeaderCell ? prevOnHeaderCell() : {}),
        "data-column-key": key,
        onResize: setWidth,
        width,
        style: { width, minWidth: 0, maxWidth: width },
      }),
      onCell: (record: unknown, index: number) => {
        const prev = prevOnCell ? prevOnCell(record, index) : {};
        return {
          ...prev,
          style: {
            ...(prev.style as React.CSSProperties || {}),
            width,
            minWidth: 0,
            maxWidth: width,
            overflow: "hidden",
          },
        };
      },
    } as T;
  });
}

export function getColumnTotalWidth<T extends Record<string, unknown>>(
  columns: T[],
  widths: Record<string, number>
): number {
  return columns.reduce((sum, col) => {
    const key = String(col.key ?? "");
    const resizable = (col as Record<string, unknown>).resizable !== false;
    const defaultWidth = (col.width as number) ?? 150;
    const width = resizable ? (widths[key] ?? defaultWidth) : defaultWidth;
    return sum + width;
  }, 0);
}
