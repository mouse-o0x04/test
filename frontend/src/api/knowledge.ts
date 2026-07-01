import api from "./client";

export interface KnowledgeFolder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeNote {
  id: number;
  title: string;
  content: string;
  folder_id: number | null;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeGraph {
  nodes: { id: number; title: string; tags: string; folder_id: number | null }[];
  edges: { source: number; target: number }[];
}

export const getFolders = () => api.get<KnowledgeFolder[]>("/knowledge/folders").then((r) => r.data);
export const createFolder = (data: { name: string; parent_id?: number | null }) =>
  api.post<KnowledgeFolder>("/knowledge/folders", data).then((r) => r.data);
export const updateFolder = (id: number, data: { name: string; parent_id?: number | null }) =>
  api.put<KnowledgeFolder>(`/knowledge/folders/${id}`, data).then((r) => r.data);
export const deleteFolder = (id: number) => api.delete(`/knowledge/folders/${id}`);

export const getNotes = (params?: { folder_id?: number | null; search?: string; tag?: string }) =>
  api.get<KnowledgeNote[]>("/knowledge/notes", { params }).then((r) => r.data);
export const getNote = (id: number) => api.get<KnowledgeNote>(`/knowledge/notes/${id}`).then((r) => r.data);
export const createNote = (data: { title: string; content?: string; folder_id?: number | null; tags?: string }) =>
  api.post<KnowledgeNote>("/knowledge/notes", data).then((r) => r.data);
export const updateNote = (id: number, data: { title?: string; content?: string; folder_id?: string | null; tags?: string }) =>
  api.put<KnowledgeNote>(`/knowledge/notes/${id}`, data).then((r) => r.data);
export const deleteNote = (id: number) => api.delete(`/knowledge/notes/${id}`);

export const getKnowledgeGraph = () => api.get<KnowledgeGraph>("/knowledge/graph").then((r) => r.data);
