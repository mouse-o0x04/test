import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, ColorPicker, Collapse, Input, message, Popconfirm, Select, Space, Spin, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getUsers } from "../../api/auth";
import { createOrderSetting, deleteOrderSetting, getOrderSettings, updateOrderSetting } from "../../api/orderSettings";
import { useAuth } from "../../hooks/useAuth";
import type { OrderSettingsItem, User } from "../../types";

const STATUS_DEFAULTS = [
  { key: "new", name: "Новый", color: "#1677ff" },
  { key: "in_progress", name: "В работе", color: "#fa8c16" },
  { key: "ready", name: "Готов", color: "#52c41a" },
  { key: "delivered", name: "Отдали", color: "#8c8c8c" },
];

const SECTION_TYPES = [
  { key: "status_color", label: "Статусы", description: "Цвета и названия статусов заказов" },
  { key: "designer_color", label: "Дизайнеры", description: "Назначьте цвет каждому дизайнеру" },
  { key: "worker_color", label: "Работники", description: "Назначьте цвет каждому работнику" },
  { key: "layout", label: "Макет", description: "Варианты макетов и их цвета" },
  { key: "source", label: "Где (Источник)", description: "Откуда пришёл заказчик" },
] as const;

function StatusSection({ items, isLoading, queryKey }: { items: OrderSettingsItem[]; isLoading: boolean; queryKey: string[] }) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; color?: string } }) => updateOrderSetting(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const createMutation = useMutation({
    mutationFn: createOrderSetting,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const existingByName = new Map(items.map((i) => [i.name, i]));

  const ensureDefaults = () => {
    for (const def of STATUS_DEFAULTS) {
      if (!items.some((i) => i.name === def.name)) {
        createMutation.mutate({ setting_type: "status_color", name: def.name, color: def.color, sort_order: STATUS_DEFAULTS.findIndex((s) => s.key === def.key) });
      }
    }
  };

  const getForDefault = (def: typeof STATUS_DEFAULTS[number]) => items.find((i) => i.name === def.name);

  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
        Названия и цвета статусов. Названия отображаются в таблице и на канбане.
      </Typography.Text>

      {items.length === 0 && !isLoading && (
        <Button onClick={ensureDefaults} style={{ marginBottom: 12 }}>
          Создать статусы по умолчанию
        </Button>
      )}

      {isLoading ? (
        <Spin size="small" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {STATUS_DEFAULTS.map((def) => {
            const item = getForDefault(def);
            return (
              <div key={def.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#fafafa", borderRadius: 6 }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: item?.color || def.color, border: "1px solid #d9d9d9", flexShrink: 0 }} />
                <Input
                  size="small"
                  value={item?.name || def.name}
                  onChange={(e) => {
                    if (item) {
                      updateMutation.mutate({ id: item.id, data: { name: e.target.value } });
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <ColorPicker
                  size="small"
                  value={item?.color || def.color}
                  onChange={(_, hex) => {
                    if (item) {
                      updateMutation.mutate({ id: item.id, data: { color: hex } });
                    } else {
                      createMutation.mutate({ setting_type: "status_color", name: def.name, color: hex, sort_order: STATUS_DEFAULTS.findIndex((s) => s.key === def.key) });
                    }
                  }}
                />
              </div>
            );
          })}
          {items.filter((i) => !STATUS_DEFAULTS.some((d) => d.name === i.name)).map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#fafafa", borderRadius: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: item.color, border: "1px solid #d9d9d9", flexShrink: 0 }} />
              <Input
                size="small"
                value={item.name}
                onChange={(e) => updateMutation.mutate({ id: item.id, data: { name: e.target.value } })}
                style={{ flex: 1 }}
              />
              <ColorPicker
                size="small"
                value={item.color}
                onChange={(_, hex) => updateMutation.mutate({ id: item.id, data: { color: hex } })}
              />
              <Popconfirm title="Удалить?" onConfirm={() => deleteOrderSetting(item.id).then(() => queryClient.invalidateQueries({ queryKey }))}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingSection({
  settingType,
  items,
  users,
  isLoading,
  queryKey,
}: {
  settingType: string;
  items: OrderSettingsItem[];
  users: User[];
  isLoading: boolean;
  queryKey: string[];
}) {
  const queryClient = useQueryClient();
  const [addName, setAddName] = useState("");
  const [addColor, setAddColor] = useState("#1677ff");
  const [userAddColor, setUserAddColor] = useState("#1677ff");

  const createMutation = useMutation({
    mutationFn: createOrderSetting,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); message.success("Добавлено"); setAddName(""); setAddColor("#1677ff"); setUserAddColor("#1677ff"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; color?: string } }) => updateOrderSetting(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOrderSetting,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); message.success("Удалено"); },
  });

  const isUserType = settingType === "designer_color" || settingType === "worker_color";

  const usedNames = new Set(items.map((i) => i.name));
  const availableUsers = users.filter((u) => u.is_active && !usedNames.has(u.username));

  const handleAdd = () => {
    const name = addName.trim();
    if (!name) { message.warning("Введите название"); return; }
    if (items.some((i) => i.name === name)) { message.warning("Такое название уже есть"); return; }
    createMutation.mutate({ setting_type: settingType, name, color: addColor, sort_order: items.length });
  };

  const handleAddUser = (username: string) => {
    const user = users.find((u) => u.username === username);
    if (!user) return;
    createMutation.mutate({ setting_type: settingType, name: user.username, color: userAddColor, sort_order: items.length });
  };

  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      {isUserType ? (
        <div style={{ marginBottom: 12 }}>
          <Space.Compact style={{ width: "100%" }}>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ flex: 1 }}
              placeholder="Добавить пользователя..."
              value={undefined}
              onChange={handleAddUser}
            >
              {availableUsers.map((u) => (
                <Select.Option key={u.id} value={u.username} label={u.full_name || u.username}>
                  {u.full_name || u.username} ({u.username})
                </Select.Option>
              ))}
            </Select>
            <ColorPicker value={userAddColor} onChange={(_, hex) => setUserAddColor(hex)} />
          </Space.Compact>
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Или введите имя вручную (например комбинацию):</Typography.Text>
          </div>
          <Space.Compact style={{ marginTop: 4, width: "100%" }}>
            <Input
              placeholder="Имя работника/дизайнера..."
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onPressEnter={handleAdd}
              style={{ flex: 1 }}
            />
            <ColorPicker value={addColor} onChange={(_, hex) => setAddColor(hex)} />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} loading={createMutation.isPending}>
              Добавить
            </Button>
          </Space.Compact>
        </div>
      ) : (
        <Space.Compact style={{ marginBottom: 12, width: "100%" }}>
          <Input
            placeholder="Название..."
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onPressEnter={handleAdd}
            style={{ flex: 1 }}
          />
          <ColorPicker value={addColor} onChange={(_, hex) => setAddColor(hex)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} loading={createMutation.isPending}>
            Добавить
          </Button>
        </Space.Compact>
      )}

      {isLoading ? (
        <Spin size="small" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {sorted.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#fafafa", borderRadius: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: item.color, border: "1px solid #d9d9d9", flexShrink: 0 }} />
              <Typography.Text style={{ flex: 1 }}>{item.name}</Typography.Text>
              <ColorPicker
                size="small"
                value={item.color}
                onChange={(_, hex) => updateMutation.mutate({ id: item.id, data: { color: hex } })}
              />
              <Popconfirm title="Удалить?" onConfirm={() => deleteMutation.mutate(item.id)}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </div>
          ))}
          {sorted.length === 0 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Пока ничего не добавлено</Typography.Text>}
        </div>
      )}
    </div>
  );
}

export default function OrderSettingsTab() {
  const { user } = useAuth();
  const queryKey = ["orderSettings"];

  const { data: users } = useQuery({ queryKey: ["users"], queryFn: getUsers });

  const sections = SECTION_TYPES.map((st) => {
    const { data: items, isLoading } = useQuery({
      queryKey: [...queryKey, st.key],
      queryFn: () => getOrderSettings(st.key),
    });
    return { ...st, items: items ?? [], isLoading };
  });

  if (!user?.is_superuser) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <Typography.Text type="secondary">Только администратор может управлять этими настройками</Typography.Text>
      </div>
    );
  }

  return (
    <div>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Управляйте вариантами для полей заказов. Цвета отображаются как цветные теги в таблице и на канбане.
      </Typography.Text>
      <Collapse
        defaultActiveKey={["status_color", "designer_color", "worker_color", "layout", "source"]}
        items={sections.map((s) => ({
          key: s.key,
          label: <Space><Typography.Text strong>{s.label}</Typography.Text><Typography.Text type="secondary" style={{ fontSize: 12 }}>({s.items.length})</Typography.Text></Space>,
          children: s.key === "status_color" ? (
            <StatusSection items={s.items} isLoading={s.isLoading} queryKey={[...queryKey, s.key]} />
          ) : (
            <SettingSection
              settingType={s.key}
              items={s.items}
              users={users ?? []}
              isLoading={s.isLoading}
              queryKey={[...queryKey, s.key]}
            />
          ),
        }))}
      />
    </div>
  );
}
