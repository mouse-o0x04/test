import api from "./client";
import type { Order, OrderFormData, OrderHistoryItem } from "../types";

export interface PriceCalculation {
  product_id: number;
  quantity: number;
  unit_price: number;
  formula: string | null;
  total: number;
}

export const getOrders = () => api.get<Order[]>("/orders").then((r) => r.data);

export const getOrder = (id: number) => api.get<Order>(`/orders/${id}`).then((r) => r.data);

export const createOrder = (data: OrderFormData) =>
  api.post<Order>("/orders", data).then((r) => r.data);

export const updateOrder = (id: number, data: Partial<OrderFormData>) =>
  api.put<Order>(`/orders/${id}`, data).then((r) => r.data);

export const deleteOrder = (id: number) => api.delete(`/orders/${id}`);

export const bulkDeleteOrders = (ids: number[]) => api.post<{ deleted: number }>("/orders/bulk-delete", { ids }).then((r) => r.data);

export const toggleItemCompleted = (orderId: number, itemId: number) =>
  api.put<Order>(`/orders/${orderId}/items/${itemId}/toggle`).then((r) => r.data);

export const toggleItemPrinted = (orderId: number, itemId: number) =>
  api.put<Order>(`/orders/${orderId}/items/${itemId}/toggle-printed`).then((r) => r.data);

export const setProcessingMethod = (orderId: number, itemId: number, processingMethod: string) =>
  api.put<Order>(`/orders/${orderId}/items/${itemId}/processing-method`, { processing_method: processingMethod }).then((r) => r.data);

export const saveItemAsProduct = (orderId: number, itemId: number) =>
  api.put<Order>(`/orders/${orderId}/items/${itemId}/save-as-product`).then((r) => r.data);

export const calculatePrice = (productId: number, quantity: number) =>
  api.get<PriceCalculation>(`/orders/calculate/${productId}`, { params: { quantity } }).then((r) => r.data);

export const getOrderHistory = (orderId: number) =>
  api.get<OrderHistoryItem[]>(`/orders/${orderId}/history`).then((r) => r.data);
