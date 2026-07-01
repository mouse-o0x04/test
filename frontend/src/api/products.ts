import api from "./client";
import type { Product, ProductFormData } from "../types";

export const getProducts = () => api.get<Product[]>("/products").then((r) => r.data);

export const getProduct = (id: number) => api.get<Product>(`/products/${id}`).then((r) => r.data);

export const createProduct = (data: ProductFormData) =>
  api.post<Product>("/products", data).then((r) => r.data);

export const updateProduct = (id: number, data: Partial<ProductFormData>) =>
  api.put<Product>(`/products/${id}`, data).then((r) => r.data);

export const deleteProduct = (id: number) => api.delete(`/products/${id}`);

export const bulkDeleteProducts = (ids: number[]) => api.post<{ deleted: number }>("/products/bulk-delete", { ids }).then((r) => r.data);

export interface CoefficientResult {
  coefficient: number;
  raw_material_name: string;
  raw_material_width_mm: number;
  raw_material_height_mm: number;
}

export const getCoefficient = (rawMaterialId: number, productWidthMm: number, productHeightMm: number) =>
  api.get<CoefficientResult>("/products/coefficient", { params: { raw_material_id: rawMaterialId, product_width_mm: productWidthMm, product_height_mm: productHeightMm } }).then((r) => r.data);
