import api from "./client";

export async function getColumnState(entity: string): Promise<Record<string, number>> {
  const res = await api.get(`/column-state/${entity}`);
  return res.data.widths || {};
}

export async function saveColumnState(entity: string, widths: Record<string, number>): Promise<void> {
  await api.put(`/column-state/${entity}`, { widths });
}
