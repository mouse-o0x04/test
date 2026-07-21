import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createUser, deleteUser, getRoles, getUsers, updateUser } from "../../api/auth";
import { textFilter, selectFilter } from "../../components/TableFilters";
import type { User } from "../../types";

export default function UsersTab() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: getUsers });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: getRoles });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); message.success("Пользователь создан"); setModalOpen(false); form.resetFields(); },
    onError: (err: { response?: { data?: { detail?: string } } }) => { message.error(err.response?.data?.detail || "Ошибка"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateUser>[1] }) => updateUser(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); message.success("Пользователь обновлён"); setModalOpen(false); setEditing(null); form.resetFields(); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); message.success("Пользователь удалён"); },
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (user: User) => { setEditing(user); form.setFieldsValue(user); setModalOpen(true); };

  const onFinish = (values: Record<string, unknown>) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: { email: values.email as string, full_name: values.full_name as string, is_active: values.is_active as boolean, role_ids: values.role_ids as number[] } });
    } else {
      createMutation.mutate({ username: values.username as string, email: values.email as string, password: values.password as string, full_name: values.full_name as string, role_ids: values.role_ids as number[] });
    }
  };

  const filteredData = (users ?? []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q);
  });

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: User, b: User) => a.id - b.id },
    { title: "Логин", dataIndex: "username", key: "username", ...textFilter<User>("username"), sorter: (a: User, b: User) => a.username.localeCompare(b.username) },
    { title: "Email", dataIndex: "email", key: "email", ...textFilter<User>("email") },
    { title: "Имя", dataIndex: "full_name", key: "full_name", ...textFilter<User>("full_name") },
    {
      title: "Роли", dataIndex: "role_ids", key: "roles",
      ...selectFilter<User>("role_ids", (roles ?? []).map((r) => ({ text: r.name, value: r.id }))),
      render: (ids: number[]) => ids?.map((id) => {
        const role = (roles ?? []).find((r) => r.id === id);
        return <Tag key={id}>{role?.name || `role#${id}`}</Tag>;
      }),
    },
    {
      title: "Статус", dataIndex: "is_active", key: "is_active",
      ...selectFilter<User>("is_active", [{ text: "активен", value: true }, { text: "заблокирован", value: false }]),
      render: (v: boolean) => <Tag color={v ? "green" : "red"}>{v ? "активен" : "заблокирован"}</Tag>,
    },
    {
      title: "Действия", key: "actions", width: 90,
      render: (_: unknown, record: User) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm title="Удалить?" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Tooltip title="Удалить">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
        <Space>
          <Input.Search placeholder="Поиск..." allowClear onChange={(e) => setSearch(e.target.value)} style={{ width: 200 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить</Button>
        </Space>
      </div>

      <Table dataSource={filteredData} columns={columns} rowKey="id" loading={isLoading} size="small" pagination={false} />

      <Modal title={editing ? "Редактировать пользователя" : "Новый пользователь"} open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.validateFields().then(onFinish).catch(() => {})}
        confirmLoading={createMutation.isPending || updateMutation.isPending}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {!editing && (
            <>
              <Form.Item name="username" label="Логин" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="password" label="Пароль" rules={[{ required: true }]}><Input.Password /></Form.Item>
            </>
          )}
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}><Input /></Form.Item>
          <Form.Item name="full_name" label="Полное имя"><Input /></Form.Item>
          <Form.Item name="role_ids" label="Роли">
            <Select mode="multiple" placeholder="Выберите роли">
              {(roles ?? []).map((r) => (<Select.Option key={r.id} value={r.id}>{r.name} — {r.description}</Select.Option>))}
            </Select>
          </Form.Item>
          {editing && <Form.Item name="is_active" label="Активен" valuePropName="checked"><Switch /></Form.Item>}
        </Form>
      </Modal>
    </>
  );
}
