import type { SortOrder } from "antd/es/table/interface";

export function toSortOrder(field: string | null, currentField: string, direction: string): SortOrder | undefined {
  if (field !== currentField) return undefined;
  return direction === "asc" ? "ascend" : "descend";
}
