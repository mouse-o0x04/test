import api from "./client";
import type { CompanyDetail, CompanyDetailFormData } from "../types";

export const getCompanyDetails = () => api.get<CompanyDetail[]>("/company-details").then((r) => r.data);

export const getCompanyDetail = (id: number) => api.get<CompanyDetail>(`/company-details/${id}`).then((r) => r.data);

export const createCompanyDetail = (data: CompanyDetailFormData) =>
  api.post<CompanyDetail>("/company-details", data).then((r) => r.data);

export const updateCompanyDetail = (id: number, data: Partial<CompanyDetailFormData>) =>
  api.put<CompanyDetail>(`/company-details/${id}`, data).then((r) => r.data);

export const deleteCompanyDetail = (id: number) => api.delete(`/company-details/${id}`);

export const getClientDetails = (clientId: number) =>
  api.get<CompanyDetail[]>(`/company-details/client/${clientId}`).then((r) => r.data);

export const attachDetailToClient = (clientId: number, detailId: number) =>
  api.post(`/company-details/client/${clientId}/attach/${detailId}`).then((r) => r.data);

export const detachDetailFromClient = (clientId: number, detailId: number) =>
  api.delete(`/company-details/client/${clientId}/detach/${detailId}`).then((r) => r.data);
