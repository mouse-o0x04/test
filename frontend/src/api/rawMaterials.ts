import api from "./client";
import type { RawMaterial, RawMaterialFormData } from "../types";

export const getRawMaterials = () => api.get<RawMaterial[]>("/raw-materials").then((r) => r.data);

export const getRawMaterial = (id: number) => api.get<RawMaterial>(`/raw-materials/${id}`).then((r) => r.data);

export const createRawMaterial = (data: RawMaterialFormData) =>
  api.post<RawMaterial>("/raw-materials", data).then((r) => r.data);

export const updateRawMaterial = (id: number, data: Partial<RawMaterialFormData>) =>
  api.put<RawMaterial>(`/raw-materials/${id}`, data).then((r) => r.data);

export const deleteRawMaterial = (id: number) => api.delete(`/raw-materials/${id}`);

export const bulkDeleteRawMaterials = (ids: number[]) => api.post<{ deleted: number }>("/raw-materials/bulk-delete", { ids }).then((r) => r.data);
