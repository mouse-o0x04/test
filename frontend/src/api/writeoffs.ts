import api from "./client";
import type { StockWriteoff, WriteoffFormData } from "../types";

export async function getWriteoffs(): Promise<StockWriteoff[]> {
  const { data } = await api.get("/writeoffs");
  return data;
}

export async function createWriteoff(payload: WriteoffFormData): Promise<StockWriteoff> {
  const { data } = await api.post("/writeoffs", payload);
  return data;
}

export async function reverseWriteoff(id: number): Promise<StockWriteoff> {
  const { data } = await api.delete(`/writeoffs/${id}`);
  return data;
}
