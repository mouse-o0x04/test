import api from "./client";

export interface AIProviderSettings {
  id: number;
  provider_name: string;
  base_url: string;
  api_key?: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  system_prompt?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AIProviderSettingsUpdate {
  provider_name?: string;
  base_url?: string;
  api_key?: string;
  model_name?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  is_active?: boolean;
}

export interface AIProviderOption {
  key: string;
  label: string;
  default_url: string;
}

export async function getAIProviders(): Promise<AIProviderOption[]> {
  const { data } = await api.get("/ai-settings/providers");
  return data;
}

export async function getAISettings(): Promise<AIProviderSettings> {
  const { data } = await api.get("/ai-settings");
  return data;
}

export async function updateAISettings(settings: AIProviderSettingsUpdate): Promise<AIProviderSettings> {
  const { data } = await api.put("/ai-settings", settings);
  return data;
}
