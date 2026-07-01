import api from "./client";
import type { Script, ScriptContent } from "../types";

export const getScripts = () => api.get<Script[]>("/scripts").then((r) => r.data);

export const getScript = (name: string) => api.get<ScriptContent>(`/scripts/${name}`).then((r) => r.data);

export const createScript = (name: string, content: string) =>
  api.post<Script>("/scripts", { name, content }).then((r) => r.data);

export const updateScript = (name: string, content: string) =>
  api.put<Script>(`/scripts/${name}`, { name, content }).then((r) => r.data);

export const deleteScript = (name: string) => api.delete(`/scripts/${name}`);

export const runScript = (name: string, data: Record<string, unknown>) =>
  api.post<{ result: number }>("/scripts/run", { name, data }).then((r) => r.data);

export const runDisplayScript = (name: string, data: Record<string, unknown>) =>
  api.post<{ result: { main: string; sub: string } }>("/scripts/run-display", { name, data }).then((r) => r.data);
