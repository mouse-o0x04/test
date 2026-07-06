export interface Client {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: string;
  company_details: CompanyDetail[];
  created_at: string;
  updated_at: string;
}

export interface ClientFormData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
}

export interface CompanyDetail {
  id: number;
  company_name: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  ogrnip?: string;
  legal_address?: string;
  actual_address?: string;
  settlement_account?: string;
  bank_name?: string;
  bik?: string;
  correspondent_account?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyDetailFormData {
  company_name: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  ogrnip?: string;
  legal_address?: string;
  actual_address?: string;
  settlement_account?: string;
  bank_name?: string;
  bik?: string;
  correspondent_account?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
}

export interface ProductRawMaterialItem {
  raw_material_id: number;
  coefficient: number;
  raw_material_name?: string;
  raw_material_width_mm?: number;
  raw_material_height_mm?: number;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  unit_price: number;
  unit_type: string;
  category?: string;
  formula?: string;
  formula_script?: string;
  raw_material_id?: number;
  material_coefficient: number;
  created_at: string;
  raw_material_name?: string;
  supplier_url?: string;
  raw_materials?: ProductRawMaterialItem[];
  default_cut_width_mm?: number;
  default_cut_height_mm?: number;
}

export interface ProductFormData {
  name: string;
  description?: string;
  unit_price: number;
  unit_type: string;
  category?: string;
  formula?: string;
  formula_script?: string;
  raw_material_id?: number;
  material_coefficient: number;
  supplier_url?: string;
  raw_materials?: ProductRawMaterialItem[];
  default_cut_width_mm?: number;
  default_cut_height_mm?: number;
}

export interface OrderItemRawMaterial {
  raw_material_id: number;
  raw_material_qty?: number;
  cut_width_mm?: number;
  cut_height_mm?: number;
  raw_material_name?: string;
}

export interface OrderItem {
  id: number;
  product_id?: number;
  quantity: number;
  unit_price: number;
  is_completed: boolean;
  is_printed: boolean;
  product_name?: string;
  product_unit?: string;
  is_custom?: boolean;
  raw_material_id?: number;
  raw_material_qty?: number;
  cut_width_mm?: number;
  cut_height_mm?: number;
  raw_materials?: OrderItemRawMaterial[];
  manual_writeoff_pending?: boolean;
  manual_writeoff_raw_material_id?: number;
  manual_writeoff_cut_width_mm?: number;
  manual_writeoff_cut_height_mm?: number;
  manual_writeoff_quantity?: number;
  manual_writeoff_raw_material_name?: string;
  processing_method?: string;
}

export interface OrderItemFormData {
  product_id?: number;
  product_name?: string;
  product_unit?: string;
  product_formula?: string;
  product_formula_script?: string;
  raw_material_id?: number;
  raw_material_qty?: number;
  cut_width_mm?: number;
  cut_height_mm?: number;
  raw_materials?: { raw_material_id: number; raw_material_qty?: number; cut_width_mm?: number; cut_height_mm?: number }[];
  quantity: number;
  unit_price?: number;
  processing_method?: string;
  manual_writeoff_pending?: boolean;
  manual_writeoff_raw_material_id?: number;
  manual_writeoff_cut_width_mm?: number;
  manual_writeoff_cut_height_mm?: number;
  manual_writeoff_quantity?: number;
}

export interface Order {
  id: number;
  client_id: number;
  total_price: number;
  status: string;
  description?: string;
  notes?: string;
  deadline?: string;
  designer?: string;
  workers?: string[];
  layout_type?: string;
  path?: string;
  source?: string;
  created_by?: number;
  created_by_name?: string;
  created_by_role?: string;
  created_at: string;
  updated_at: string;
  client_name?: string;
  items: OrderItem[];
  progress: number;
}

export interface OrderFormData {
  client_id: number;
  status?: string;
  description?: string;
  notes?: string;
  deadline?: string;
  designer?: string;
  workers?: string[];
  layout_type?: string;
  path?: string;
  source?: string;
  items: OrderItemFormData[];
}

export interface HermesAgent {
  id: number;
  name: string;
  agent_type: string;
  config: Record<string, unknown>;
  webhook_url?: string;
  is_active: boolean;
  last_seen?: string;
  created_at: string;
}

export interface HermesAgentFormData {
  name: string;
  agent_type: string;
  config?: Record<string, unknown>;
  webhook_url?: string;
  is_active?: boolean;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_to_email?: string;
}

export interface HermesEvent {
  id: number;
  agent_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  response?: Record<string, unknown>;
  created_at: string;
}

export interface WarehouseItem {
  id: number;
  product_id?: number;
  raw_material_id?: number;
  quantity: number;
  min_quantity: number;
  defective_quantity: number;
  defective_reason?: string;
  stock_calculation_script?: string;
  display_format_script?: string;
  product_name?: string;
  product_unit_type?: string;
  raw_material_name?: string;
  raw_material_unit_type?: string;
  raw_material_roll_length_m?: number;
  pending_writeoffs_count?: number;
}

export interface WarehouseFormData {
  product_id?: number;
  raw_material_id?: number;
  quantity: number;
  min_quantity: number;
  defective_quantity: number;
  defective_reason?: string;
  stock_calculation_script?: string;
  display_format_script?: string;
}

export interface StockInfo {
  product_id?: number;
  raw_material_id?: number;
  quantity: number;
  min_quantity: number;
}

export const ORDER_STATUSES = [
  "new",
  "in_progress",
  "ready",
  "delivered",
] as const;

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_superuser: boolean;
  role_ids: number[];
  permissions: string[];
  created_at?: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  permission_ids: number[];
}

export interface Permission {
  id: number;
  name: string;
  description?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

export interface Script {
  name: string;
  filename: string;
  size: number;
}

export interface ScriptContent {
  name: string;
  content: string;
}

export interface OrderSettingsItem {
  id: number;
  setting_type: "layout" | "source" | "designer_color" | "worker_color" | "status_color";
  name: string;
  color: string;
  sort_order: number;
}

export interface OrderHistoryItem {
  id: number;
  order_id: number;
  action: string;
  field?: string;
  old_value?: string;
  new_value?: string;
  user_id?: number;
  user_name?: string;
  user_role?: string;
  created_at: string;
}

export interface RawMaterial {
  id: number;
  name: string;
  description?: string;
  width_mm?: number;
  height_mm?: number;
  roll_width_m?: number;
  roll_length_m?: number;
  density?: string;
  color_finish?: string;
  unit_type: string;
  unit_price: number;
  display_format_script?: string;
  stock_calculation_script?: string;
  created_at: string;
}

export interface RawMaterialFormData {
  name: string;
  description?: string;
  width_mm?: number;
  height_mm?: number;
  roll_width_m?: number;
  roll_length_m?: number;
  density?: string;
  color_finish?: string;
  unit_type?: string;
  unit_price?: number;
  display_format_script?: string;
  stock_calculation_script?: string;
}

export interface StockWriteoff {
  id: number;
  item_type: "product" | "raw_material";
  product_id?: number;
  raw_material_id?: number;
  quantity: number;
  reason?: string;
  order_id?: number;
  created_by?: number;
  created_by_name?: string;
  remaining_width?: number;
  remaining_height?: number;
  created_at: string;
  item_name?: string;
  unit_price?: number;
  total_value?: number;
}

export interface WriteoffFormData {
  item_type: "product" | "raw_material";
  product_id?: number;
  raw_material_id?: number;
  quantity: number;
  reason?: string;
}

export interface ManualWriteoffPending {
  order_id: number;
  order_item_id: number;
  raw_material_id: number;
  raw_material_name?: string;
  cut_width_mm?: number;
  cut_height_mm?: number;
  quantity?: number;
  already_written_off?: boolean;
  writeoff_id?: number;
}

export interface AuditLog {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  old_data?: string;
  new_data?: string;
  user_id?: number;
  user_name?: string;
  created_at: string;
}
