import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createRole, deleteRole, getPermissions, getRoles, updateRole } from "../../api/auth";
import type { Permission, Role } from "../../types";

const PERM_GROUPS: Record<string, string[]> = {
  Клиенты: ["clients.view", "clients.create", "clients.edit", "clients.delete"],
  Продукты: ["products.view", "products.create", "products.edit", "products.delete"],
  Заказы: ["orders.view", "orders.create", "orders.edit", "orders.delete"],
  Склад: ["warehouse.view", "warehouse.create", "warehouse.edit", "warehouse.delete"],
  Hermes: ["hermes.view", "hermes.manage"],
  Пользователи: ["users.view", "users.manage", "roles.manage"],
  "Цены и суммы": ["prices.view", "prices.revenue"],
};

const PERM_LABELS: Record<string, string> = {
  "clients.view": "Просмотр клиентов",
  "clients.create": "Создание клиентов",
  "clients.edit": "Редактирование клиентов",
  "clients.delete": "Удаление клиентов",
  "products.view": "Просмотр продуктов",
  "products.create": "Создание продуктов",
  "products.edit": "Редактирование продуктов",
  "products.delete": "Удаление продуктов",
  "orders.view": "Просмотр заказов",
  "orders.create": "Создание заказов",
  "orders.edit": "Редактирование заказов",
  "orders.delete": "Удаление заказов",
  "warehouse.view": "Просмотр склада",
  "warehouse.create": "Создание на складе",
  "warehouse.edit": "Редактирование на складе",
  "warehouse.delete": "Удаление со склада",
  "hermes.view": "Просмотр Hermes",
  "hermes.manage": "Управление Hermes",
  "users.view": "Просмотр пользователей",
  "users.manage": "Управление пользователями",
  "roles.manage": "Управление ролями",
  "prices.view": "Просмотр цен",
  "prices.revenue": "Просмотр выручки",
};

export default function RolesTab() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form] = Form.useForm();

  const { data: roles, isLoading: rolesLoading } = useQuery({ queryKey: ["roles"], queryFn: getRoles });
  const { data: permissions } = useQuery({ queryKey: ["permissions"], queryFn: getPermissions });

  const permMap = new Map((permissions ?? []).map((p: Permission) => [p.name, p.id]));

  const createMutation = useMutation({
    mutationFn: createRole,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["roles"] }); message.success("Роль создана"); setModalOpen(false); form.resetFields(); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateRole>[1] }) => updateRole(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["roles"] }); message.success("Роль обновлена"); setModalOpen(false); setEditing(null); form.resetFields(); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["roles"] }); message.success("Роль удалена"); },
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };

  const openEdit = (role: Role) => {
    setEditing(role);
    form.setFieldsValue({ name: role.name, description: role.description, permission_ids: role.permission_ids });
    setModalOpen(true);
  };

  const onFinish = (values: Record<string, unknown>) => {
    const data = { name: values.name as string, description: values.description as string, permission_ids: values.permission_ids as number[] };
    if (editing) { updateMutation.mutate({ id: editing.id, data }); }
    else { createMutation.mutate(data); }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "Название", dataIndex: "name", key: "name", render: (v: string) => <Tag>{v}</Tag> },
    { title: "Описание", dataIndex: "description", key: "description" },
    {
      title: "Права", dataIndex: "permission_ids", key: "permissions",
      render: (ids: number[]) => <Typography.Text type="secondary">{ids?.length || 0} прав</Typography.Text>,
    },
    {
      title: "", key: "actions", width: 120,
      render: (_: unknown, record: Role) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Удалить роль?" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить роль</Button>
      </div>

      <Table dataSource={roles} columns={columns} rowKey="id" loading={rolesLoading} size="small" pagination={false} />

      <Modal
        title={editing ? `Редактировать: ${editing.name}` : "Новая роль"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.validateFields().then(onFinish).catch(() => {})}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input placeholder="operator" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input placeholder="Оператор печати" />
          </Form.Item>
          <Form.Item name="permission_ids" noStyle><Input type="hidden" /></Form.Item>
          <Form.Item label="Права доступа" shouldUpdate={(prev: Record<string, unknown>, cur: Record<string, unknown>) => JSON.stringify(prev.permission_ids) !== JSON.stringify(cur.permission_ids)}>
            {({ getFieldValue, setFieldValue }) => {
              const currentIds: number[] = getFieldValue("permission_ids") || [];
              return Object.entries(PERM_GROUPS).map(([group, permNames]) => (
              <div key={group} style={{ marginBottom: 12 }}>
                <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>{group}</Typography.Text>
                <Row gutter={[8, 4]}>
                  {permNames.map((pn) => {
                    const permId = permMap.get(pn);
                    if (!permId) return null;
                    return (
                      <Col key={pn} xs={24} sm={12}>
                        <Checkbox
                          value={permId}
                          checked={currentIds.includes(permId)}
                          onChange={(e) => {
                            const next = e.target.checked ? [...currentIds, permId] : currentIds.filter((id: number) => id !== permId);
                            setFieldValue("permission_ids", next);
                          }}
                        >
                          {PERM_LABELS[pn] || pn}
                        </Checkbox>
                      </Col>
                    );
                  })}
                </Row>
              </div>
              ));
            }}
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
