import api from "./client";

export interface BackupInfo {
  filename: string;
  size_bytes: number;
  created_at: string;
}

export const dumpAll = () =>
  api.get("/db/dump", { responseType: "blob" }).then((r) => r.data);

export const dumpSingle = (db: string) =>
  api.get("/db/dump-single", { params: { db }, responseType: "blob" }).then((r) => r.data);

export const restoreAll = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post("/db/restore", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then((r) => r.data);
};

export const listBackups = () =>
  api.get<BackupInfo[]>("/db/backups").then((r) => r.data);

export const saveBackup = () =>
  api.post<BackupInfo & { ok: boolean }>("/db/save-backup").then((r) => r.data);

export const deleteBackup = (filename: string) =>
  api.delete(`/db/backups/${filename}`).then((r) => r.data);
