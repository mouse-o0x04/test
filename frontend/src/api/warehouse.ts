import api from "./client";
import type { WarehouseItem, WarehouseFormData, StockInfo, ManualWriteoffPending } from "../types";

export const getWarehouseItems = () =>
  api.get<WarehouseItem[]>("/warehouse").then((r) => r.data);

export const getWarehouseItem = (id: number) =>
  api.get<WarehouseItem>(`/warehouse/${id}`).then((r) => r.data);

export const createWarehouseItem = (data: WarehouseFormData) =>
  api.post<WarehouseItem>("/warehouse", data).then((r) => r.data);

export const updateWarehouseItem = (id: number, data: Partial<WarehouseFormData>) =>
  api.put<WarehouseItem>(`/warehouse/${id}`, data).then((r) => r.data);

export const deleteWarehouseItem = (id: number) =>
  api.delete(`/warehouse/${id}`);

export const bulkDeleteWarehouse = (ids: number[]) =>
  api.post<{ deleted: number }>("/warehouse/bulk-delete", { ids }).then((r) => r.data);

export const getProductStock = (productId: number) =>
  api.get<StockInfo>(`/orders/stock/${productId}`).then((r) => r.data);

export const getPendingWriteoffs = (itemId: number) =>
  api.get<ManualWriteoffPending[]>(`/warehouse/${itemId}/pending-writeoffs`).then((r) => r.data);

export const confirmManualWriteoff = (itemId: number, orderItemId: number) =>
  api.post<ManualWriteoffPending>(`/warehouse/${itemId}/confirm-manual-writeoff`, { order_item_id: orderItemId }).then((r) => r.data);

export const cancelPendingWriteoff = (orderItemId: number) =>
  api.delete(`/warehouse/pending-writeoff/${orderItemId}`).then((r) => r.data);
