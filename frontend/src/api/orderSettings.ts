import api from "./client";
import type { OrderSettingsItem } from "../types";

export const getOrderSettings = (type?: string) =>
  api.get<OrderSettingsItem[]>("/order-settings", { params: type ? { type } : {} }).then((r) => r.data);

export const createOrderSetting = (data: { setting_type: string; name: string; color: string; sort_order?: number }) =>
  api.post<OrderSettingsItem>("/order-settings", data).then((r) => r.data);

export const updateOrderSetting = (id: number, data: { name?: string; color?: string; sort_order?: number }) =>
  api.put<OrderSettingsItem>(`/order-settings/${id}`, data).then((r) => r.data);

export const deleteOrderSetting = (id: number) =>
  api.delete(`/order-settings/${id}`);
