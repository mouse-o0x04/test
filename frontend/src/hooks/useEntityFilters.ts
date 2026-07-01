import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getFilterState, saveFilterState } from "../api/filterState";

interface FilterStateData {
  filters: Record<string, unknown>;
  sort_field: string | null;
  sort_direction: string;
  search: string;
}

export function useEntityFilters(entity: string) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<string>("");
  const latestDataRef = useRef<FilterStateData>({ filters: {}, sort_field: null, sort_direction: "asc", search: "" });

  const { data: saved } = useQuery({
    queryKey: ["filterState", entity],
    queryFn: () => getFilterState(entity),
  });

  const saveMutation = useMutation({
    mutationFn: (data: FilterStateData) => saveFilterState(entity, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["filterState", entity] }); },
  });

  useEffect(() => {
    if (saved) {
      const key = JSON.stringify(saved);
      if (key !== lastSyncedRef.current) {
        lastSyncedRef.current = key;
        const cleaned = Object.fromEntries(
          Object.entries(saved.filters || {}).filter(([, v]) => v != null)
        );
        setFilters(cleaned);
        setSearch(saved.search || "");
        setSortField(saved.sort_field || null);
        setSortDirection((saved.sort_direction as "asc" | "desc") || "asc");
        setLoaded(true);
        latestDataRef.current = { filters: cleaned, sort_field: saved.sort_field || null, sort_direction: (saved.sort_direction as "asc" | "desc") || "asc", search: saved.search || "" };
      }
    }
  }, [saved]);

  const flushSave = useCallback((data: FilterStateData) => {
    latestDataRef.current = data;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMutation.mutate(data);
    }, 500);
  }, [saveMutation]);

  const updateFilters = useCallback((newFilters: Record<string, unknown>) => {
    setFilters(newFilters);
    flushSave({ ...latestDataRef.current, filters: newFilters });
  }, [flushSave]);

  const updateSearch = useCallback((newSearch: string) => {
    setSearch(newSearch);
    flushSave({ ...latestDataRef.current, search: newSearch });
  }, [flushSave]);

  const updateSort = useCallback((field: string | null, direction: "asc" | "desc") => {
    setSortField(field);
    setSortDirection(direction);
    flushSave({ ...latestDataRef.current, sort_field: field, sort_direction: direction });
  }, [flushSave]);

  const resetFilters = useCallback(() => {
    setFilters({});
    setSearch("");
    setSortField(null);
    setSortDirection("asc");
    flushSave({ filters: {}, sort_field: null, sort_direction: "asc", search: "" });
  }, [flushSave]);

  return {
    filters,
    search,
    sortField,
    sortDirection,
    loaded,
    updateFilters,
    updateSearch,
    updateSort,
    resetFilters,
  };
}
