import api from "./client";

export interface FilterState {
  entity: string;
  filters: Record<string, unknown>;
  sort_field: string | null;
  sort_direction: string;
  search: string;
}

export const getFilterState = (entity: string) =>
  api.get<FilterState>(`/filter-state/${entity}`).then((r) => r.data);

export const saveFilterState = (entity: string, data: Omit<FilterState, "entity">) =>
  api.put<FilterState>(`/filter-state/${entity}`, data).then((r) => r.data);
