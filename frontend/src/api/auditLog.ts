import api from "./client";
import type { AuditLog } from "../types";

export async function getAuditLogs(entityType: string, entityId: number): Promise<AuditLog[]> {
  const { data } = await api.get("/audit-log", { params: { entity_type: entityType, entity_id: entityId } });
  return data;
}
