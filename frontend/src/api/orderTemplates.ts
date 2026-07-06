import api from "./client";

export interface OrderTemplateItem {
  product_name: string;
  product_id?: number;
  quantity: number;
  unit_price?: number;
  raw_material_id?: number;
  cut_width_mm?: number;
  cut_height_mm?: number;
  raw_materials?: { raw_material_id: number; cut_width_mm?: number; cut_height_mm?: number }[];
  _itemMode?: string;
}

export interface OrderTemplate {
  id: number;
  name: string;
  items: OrderTemplateItem[];
  created_by?: number;
}

export const getOrderTemplates = () => api.get<OrderTemplate[]>("/order-templates").then((r) => r.data);

export const createOrderTemplate = (data: { name: string; items: OrderTemplateItem[] }) =>
  api.post<OrderTemplate>("/order-templates", data).then((r) => r.data);

export const updateOrderTemplate = (id: number, data: { name: string; items: OrderTemplateItem[] }) =>
  api.put<OrderTemplate>(`/order-templates/${id}`, data).then((r) => r.data);

export const deleteOrderTemplate = (id: number) =>
  api.delete(`/order-templates/${id}`).then((r) => r.data);
