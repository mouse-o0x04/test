import api from "./client";
import type { User, Role, Permission } from "../types";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const login = (username: string, password: string) =>
  api.post<LoginResponse>("/auth/login", { username, password }).then((r) => r.data);

export const getMe = () => api.get<User>("/auth/me").then((r) => r.data);

export const getUsers = () => api.get<User[]>("/auth/users").then((r) => r.data);

export const getRoles = () => api.get<Role[]>("/auth/roles").then((r) => r.data);

export const getPermissions = () => api.get<Permission[]>("/auth/permissions").then((r) => r.data);

export const createUser = (data: { username: string; email: string; password: string; full_name?: string; role_ids?: number[] }) =>
  api.post<User>("/auth/register", data).then((r) => r.data);

export const updateUser = (id: number, data: { email?: string; full_name?: string; is_active?: boolean; role_ids?: number[] }) =>
  api.put<User>(`/auth/users/${id}`, data).then((r) => r.data);

export const deleteUser = (id: number) => api.delete(`/auth/users/${id}`);

export const createRole = (data: { name: string; description?: string; permission_ids?: number[] }) =>
  api.post<Role>("/auth/roles", data).then((r) => r.data);

export const updateRole = (id: number, data: { name: string; description?: string; permission_ids?: number[] }) =>
  api.put<Role>(`/auth/roles/${id}`, data).then((r) => r.data);

export const deleteRole = (id: number) => api.delete(`/auth/roles/${id}`);
