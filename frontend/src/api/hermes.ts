import api from "./client";
import type { HermesAgent, HermesAgentFormData, HermesEvent } from "../types";

export const getAgents = () => api.get<HermesAgent[]>("/hermes/agents").then((r) => r.data);

export const getAgent = (id: number) =>
  api.get<HermesAgent>(`/hermes/agents/${id}`).then((r) => r.data);

export const createAgent = (data: HermesAgentFormData) =>
  api.post<HermesAgent>("/hermes/agents", data).then((r) => r.data);

export const updateAgent = (id: number, data: Partial<HermesAgentFormData>) =>
  api.put<HermesAgent>(`/hermes/agents/${id}`, data).then((r) => r.data);

export const deleteAgent = (id: number) => api.delete(`/hermes/agents/${id}`);

export const getEvents = (agentId?: number) =>
  api
    .get<HermesEvent[]>("/hermes/events", { params: { agent_id: agentId } })
    .then((r) => r.data);

export const sendEvent = (data: { agent_id: number; event_type: string; payload: Record<string, unknown> }) =>
  api.post<HermesEvent>("/hermes/events", data).then((r) => r.data);

export interface DailyReportPreview {
  report_text: string;
  raw_text: string;
  data: {
    date: string;
    today_created_count: number;
    today_revenue: number;
    total_revenue: number;
    ready_count: number;
    ready_orders: Array<{ id: number; client: string; total_price: number }>;
    delivered_count: number;
    delivered_orders: Array<{ id: number; client: string; total_price: number }>;
    active_count: number;
    active_orders: Array<{ id: number; client: string; status: string; total_price: number }>;
    in_progress_count: number;
    low_stock_count: number;
    low_stock_items: Array<{ product: string; quantity: number; min_quantity: number; unit: string; deficit: number }>;
    total_orders: number;
  };
}

export const getDailyReportPreview = (useAi = true) =>
  api.get<DailyReportPreview>("/hermes/daily-report/preview", { params: { use_ai: useAi } }).then((r) => r.data);

export const sendDailyReport = (agentId: number, useAi = true) =>
  api.post<HermesEvent>("/hermes/daily-report", { agent_id: agentId, use_ai: useAi }).then((r) => r.data);
