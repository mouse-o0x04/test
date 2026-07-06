import api from "./client";

export interface Offcut {
  id: number;
  raw_material_id: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  order_id?: number;
  raw_material_name?: string;
  created_at?: string;
}

export const getOffcuts = (rawMaterialId?: number) =>
  api.get<Offcut[]>("/offcuts", { params: rawMaterialId ? { raw_material_id: rawMaterialId } : {} }).then((r) => r.data);

export const createOffcut = (data: { raw_material_id: number; width_mm: number; height_mm: number; quantity: number; order_id?: number }) =>
  api.post<Offcut>("/offcuts", data).then((r) => r.data);

export const deleteOffcut = (id: number) =>
  api.delete(`/offcuts/${id}`).then((r) => r.data);
