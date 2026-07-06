import {
  BankOutlined, ApartmentOutlined, DisconnectOutlined, PlusOutlined, UnorderedListOutlined,
  UserOutlined, MailOutlined, PhoneOutlined, HomeOutlined, PrinterOutlined, DeleteOutlined,
} from "@ant-design/icons";
import {
  Button, Card, Col, Checkbox, Descriptions, Divider, Drawer, Form, Input, Modal,
  Popconfirm, Progress, Row, Space, Table, Tag, Tooltip, Typography, message,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useState } from "react";
import { attachDetailToClient, createCompanyDetail, deleteCompanyDetail, detachDetailFromClient, getCompanyDetails, updateCompanyDetail } from "../api/companyDetails";
import { createClient, deleteClient, getClients, updateClient, bulkDeleteClients } from "../api/clients";
import { getOrderSettings } from "../api/orderSettings";
import { getOrders, toggleItemCompleted, toggleItemPrinted } from "../api/orders";
import ClientGraph from "../components/ClientGraph";
import { textFilter } from "../components/TableFilters";
import { useEntityFilters } from "../hooks/useEntityFilters";
import { useViewMode } from "../hooks/useViewMode";
import type { Client, ClientFormData, CompanyDetail, CompanyDetailFormData, Order, OrderItem } from "../types";
import { toSortOrder } from "../utils/sort";

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form] = Form.useForm<ClientFormData>();
  const entityFilters = useEntityFilters("clients");
  const [viewMode, setViewMode] = useViewMode("clients", "table");

  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyDetail | null>(null);
  const [companyForm] = Form.useForm<CompanyDetailFormData>();
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [attachClientId, setAttachClientId] = useState<number | null>(null);
  const [requisiteText, setRequisiteText] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const { data: clients, isLoading } = useQuery({ queryKey: ["clients"], queryFn: getClients });
  const { data: allCompanyDetails } = useQuery({ queryKey: ["companyDetails"], queryFn: getCompanyDetails });
  const { data: orders } = useQuery({ queryKey: ["orders"], queryFn: getOrders, refetchInterval: 15000 });
  const { data: settings } = useQuery({ queryKey: ["orderSettings"], queryFn: () => getOrderSettings() });

  const createMutation = useMutation({
    mutationFn: createClient,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); message.success("Клиент создан"); setModalOpen(false); form.resetFields(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ClientFormData> }) => updateClient(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); message.success("Клиент обновлён"); setModalOpen(false); setEditing(null); form.resetFields(); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteClient,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); message.success("Клиент удалён"); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteClients,
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["clients"] }); message.success(`Удалено: ${data.deleted}`); setSelectedRowKeys([]); },
    onError: () => message.error("Ошибка удаления"),
  });

  const createCompanyMutation = useMutation({
    mutationFn: createCompanyDetail,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["companyDetails"] }); queryClient.invalidateQueries({ queryKey: ["clients"] }); message.success("Реквизиты созданы"); setCompanyModalOpen(false); companyForm.resetFields(); },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CompanyDetailFormData> }) => updateCompanyDetail(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["companyDetails"] }); queryClient.invalidateQueries({ queryKey: ["clients"] }); message.success("Реквизиты обновлены"); setCompanyModalOpen(false); setEditingCompany(null); companyForm.resetFields(); },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: deleteCompanyDetail,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["companyDetails"] }); queryClient.invalidateQueries({ queryKey: ["clients"] }); message.success("Реквизиты удалены"); },
  });

  const attachMutation = useMutation({
    mutationFn: ({ clientId, detailId }: { clientId: number; detailId: number }) => attachDetailToClient(clientId, detailId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); message.success("Реквизиты привязаны"); setAttachModalOpen(false); },
  });

  const detachMutation = useMutation({
    mutationFn: ({ clientId, detailId }: { clientId: number; detailId: number }) => detachDetailFromClient(clientId, detailId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); message.success("Реквизиты отвязаны"); },
  });

  const toggleItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) => toggleItemCompleted(orderId, itemId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setOrderDetail((prev) => prev ? { ...prev, ...data } : null);
    },
  });
  const printedItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) => toggleItemPrinted(orderId, itemId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setOrderDetail((prev) => prev ? { ...prev, ...data } : null);
    },
  });

  const statusLabels: Record<string, string> = { new: "Новый", in_progress: "В работе", ready: "Готов", delivered: "Отдали" };
  const statusColors: Record<string, string> = {};
  (settings ?? []).filter((s) => s.setting_type === "status_color").forEach((s) => { statusColors[s.name] = s.color; });
  const designerColors: Record<string, string> = {};
  (settings ?? []).filter((s) => s.setting_type === "designer_color").forEach((s) => { designerColors[s.name] = s.color; });
  const workerColors: Record<string, string> = {};
  (settings ?? []).filter((s) => s.setting_type === "worker_color").forEach((s) => { workerColors[s.name] = s.color; });

  const getColor = (map: Record<string, string>, name: string) => {
    if (map[name]) return map[name];
    let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return `hsl(${Math.abs(h) % 360}, 55%, 50%)`;
  };

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (client: Client) => { setEditing(client); form.setFieldsValue(client); setModalOpen(true); };

  const onFinish = (values: ClientFormData) => {
    if (editing) { updateMutation.mutate({ id: editing.id, data: values }); }
    else { createMutation.mutate(values); }
  };

  const openCompanyCreate = () => { setEditingCompany(null); companyForm.resetFields(); setRequisiteText(""); setCompanyModalOpen(true); };
  const openCompanyEdit = (detail: CompanyDetail) => { setEditingCompany(detail); companyForm.setFieldsValue(detail); setRequisiteText(""); setCompanyModalOpen(true); };

  const onCompanyFinish = (values: CompanyDetailFormData) => {
    if (editingCompany) { updateCompanyMutation.mutate({ id: editingCompany.id, data: values }); }
    else { createCompanyMutation.mutate(values); }
  };

  const parseRequisites = () => {
    const raw = requisiteText;
    const text = raw
      .replace(/\t+/g, "\n")
      .replace(/\|/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n");

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const flat = lines.join(" ");

    const clean = (s: string) => s?.replace(/[^\d]/g, "") || undefined;

    const extractDigits = (text: string, min: number, max: number): string | undefined => {
      const re = new RegExp(`(\\d(?:[\\s]*\\d){${min - 1},${max - 1}})`);
      const m = text.match(re);
      return m ? m[1].replace(/\s+/g, "").slice(0, max) : undefined;
    };

    const fields: Record<string, string | undefined> = {};

    // ИНН
    fields.inn = (() => {
      const m = flat.match(/ИНН[\s:]*(\d[\d\s]*\d)/i);
      if (m) return m[1].replace(/\s/g, "").slice(0, 12);
      return extractDigits(flat, 10, 12);
    })();

    // КПП
    fields.kpp = (() => {
      const m = flat.match(/КПП[\s:]*(\d[\d\s]*\d)/i);
      if (m) return m[1].replace(/\s/g, "").slice(0, 9);
      return undefined;
    })();

    // ОГРНИП (до ОГРН!)
    fields.ogrnip = (() => {
      const m = flat.match(/ОГРНИП[\s:]*(\d[\d\s]*\d)/i);
      return m ? m[1].replace(/\s/g, "").slice(0, 15) : undefined;
    })();

    // ОГРН
    fields.ogrn = (() => {
      const m = flat.match(/(?<!ОГРНИП)ОГРН[\s:]*(\d[\d\s]*\d)/i);
      return m ? m[1].replace(/\s/g, "").slice(0, 15) : undefined;
    })();

    // Р/с (все варианты: Р/с, Р/сч., Расч.счет, Расчётный счёт)
    fields.settlement_account = (() => {
      const m = flat.match(/(?:Р[\/\\]с(?:ч\.?)?|Расч[её]тн(?:ый)?\s*счёт|Account)[\s:]*(\d[\d\s]*\d)/i);
      return m ? m[1].replace(/\s/g, "").slice(0, 20) : undefined;
    })();

    // К/с (все варианты)
    fields.correspondent_account = (() => {
      const m = flat.match(/(?:К[\/\\]с|Корр[её]кт?\s*счёт|Corr)[\s:]*(\d[\d\s]*\d)/i);
      return m ? m[1].replace(/\s/g, "").slice(0, 20) : undefined;
    })();

    // БИК
    fields.bik = (() => {
      const m = flat.match(/(?:БИК|BIK)[\s:]*(\d[\d\s]*\d)/i);
      return m ? m[1].replace(/\s/g, "").slice(0, 9) : undefined;
    })();

    // Банк (много паттернов)
    fields.bank_name = (() => {
      const bankLine = lines.find((l) => /(?:Банк|Bank|в\s+ПАО|в\s+АО|в\s+ОАО|в\s+ЗАО)/i.test(l));
      if (bankLine) {
        const m1 = bankLine.match(/(?:Банк|Bank)[\s:]+(.+)/i);
        if (m1) return m1[1].trim().replace(/\s+/g, " ").slice(0, 255);
        const m2 = bankLine.match(/в\s+(.+)/i);
        if (m2) return m2[1].trim().replace(/\s+/g, " ").slice(0, 255);
        return bankLine.trim().replace(/\s+/g, " ").slice(0, 255);
      }
      const m = flat.match(/(?:Банк|Bank)[\s:]+(.+?)(?:\s+БИК|\s+к\/с|\s*$)/i);
      if (m) return m[1].trim().replace(/\s+/g, " ").slice(0, 255);
      return undefined;
    })();

    // Телефон (расширенный)
    fields.phone = (() => {
      const m = flat.match(/(?:Телефон|Тел\.?|Тел:|Phone|Tel)[\s:]*([+\d\-() ]{7,})/i);
      if (m) return m[1].trim().slice(0, 50);
      const m2 = flat.match(/(\+7[\s\-()0-9]{10,}|8[\s\-()0-9]{10,})/);
      return m2 ? m2[1].trim().slice(0, 50) : undefined;
    })();

    // Email
    fields.email = (() => {
      const m = flat.match(/(?:E-?mail|Почта|Email)[:\s]*([\w.+-]+@[\w.-]+\.\w+)/i);
      return m ? m[1].trim().slice(0, 255) : undefined;
    })();

    // Сайт
    const website = (() => {
      const m = flat.match(/(?:Сайт|Website|Web)[:\s]*(www\.[\w.-]+|https?:\/\/[\w.-]+)/i);
      return m ? m[1].trim() : undefined;
    })();

    // Юр/адрес, Юридический адрес, Адрес (ищем по строкам, чтобы не захватить банк)
    fields.legal_address = (() => {
      const addrLine = lines.find((l) => /(?:Юридический адрес|Юр[\/\.]? адрес|Legal address|Юр\/адрес|Адрес)/i.test(l));
      if (addrLine) {
        const m = addrLine.match(/(?:Юридический адрес|Юр[\/\.]? адрес|Legal address|Юр\/адрес|Адрес)[\s:]+(.+)/i);
        if (m) return m[1].trim().replace(/\s+/g, " ").slice(0, 500);
      }
      return undefined;
    })();

    // Фактический адрес
    fields.actual_address = (() => {
      const m = flat.match(/(?:Фактический адрес|Факт[\/\.]? адрес|Actual address)[\s:]+(.+)/i);
      return m ? m[1].trim().replace(/\s+/g, " ").slice(0, 500) : undefined;
    })();

    // Контактное лицо / Генеральный директор
    fields.contact_person = (() => {
      const m = flat.match(/(?:Контактное лицо|Контакт|Генеральный директор|Ген\.?\s*директор|Contact)[\s:]+([А-ЯЁа-яё\s-]+)/i);
      return m ? m[1].trim().replace(/\s+/g, " ").slice(0, 255) : undefined;
    })();

    // Название организации
    fields.company_name = (() => {
      const orgTypes = /(?:Общество с ограниченной ответственностью|Акционерное общество|Публичное акционерное общество|Некоммерческое партнёрство|Фонд|Учреждение)/i;
      const m1 = flat.match(orgTypes);
      if (m1) {
        const after = flat.slice(m1.index! + m1[0].length).trim();
        const quoted = after.match(/[«"]([^»"]+)[»"]/);
        if (quoted) return `${m1[0]} «${quoted[1]}»`.replace(/\s+/g, " ");
      }

      const abbrs = /(?:ООО|ОАО|ЗАО|ПАО|АО|ИП|МУП|ГУП|ФГУП|ЧУП|УП)\s*[«"]?([^«"\n]+)[»"]?/i;
      const m2 = flat.match(abbrs);
      if (m2) {
        const abbr = m2[0].match(/(?:ООО|ОАО|ЗАО|ПАО|АО|ИП|МУП|ГУП|ФГУП|ЧУП|УП)/i);
        const name = m2[1].trim().replace(/»|"/g, "");
        return `${abbr?.[0] || ""} «${name}»`;
      }

      return lines[0]?.slice(0, 255) || undefined;
    })();

    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v && v.length > 0) values[k] = v;
    }
    if (website && !values.company_name) {
      // skip website as company name
    }

    companyForm.setFieldsValue(values as unknown as CompanyDetailFormData);
    if (Object.keys(values).length > 0) {
      message.success(`Распознано ${Object.keys(values).length} полей`);
    } else {
      message.warning("Не удалось распознать реквизиты. Проверьте формат.");
    }
  };

  const openAttach = (clientId: number) => { setAttachClientId(clientId); setAttachModalOpen(true); };

  const filteredData = (() => {
    let data = (clients ?? []).filter((c) => {
      if (!entityFilters.search) return true;
      const q = entityFilters.search.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q)
      );
    });
    if (entityFilters.sortField && entityFilters.sortDirection) {
      const dir = entityFilters.sortDirection === "asc" ? 1 : -1;
      data = [...data].sort((a, b) => {
        const av = a[entityFilters.sortField as keyof Client];
        const bv = b[entityFilters.sortField as keyof Client];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        return 0;
      });
    }
    return data;
  })();

  const clientOrders = detailClient
    ? (orders ?? []).filter((o) => o.client_id === detailClient.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: Client, b: Client) => a.id - b.id, sortOrder: toSortOrder(entityFilters.sortField, "id", entityFilters.sortDirection) },
    { title: "Имя", dataIndex: "name", key: "name", ...textFilter<Client>("name", "Имя"), sorter: (a: Client, b: Client) => a.name.localeCompare(b.name), filteredValue: entityFilters.filters["name"] as string[] | null, sortOrder: toSortOrder(entityFilters.sortField, "name", entityFilters.sortDirection) },
    { title: "Email", dataIndex: "email", key: "email", ...textFilter<Client>("email"), sorter: (a: Client, b: Client) => a.email.localeCompare(b.email), filteredValue: entityFilters.filters["email"] as string[] | null, sortOrder: toSortOrder(entityFilters.sortField, "email", entityFilters.sortDirection) },
    { title: "Телефон", dataIndex: "phone", key: "phone", ...textFilter<Client>("phone"), filteredValue: entityFilters.filters["phone"] as string[] | null },
    { title: "Компания", dataIndex: "company", key: "company", ...textFilter<Client>("company"), filteredValue: entityFilters.filters["company"] as string[] | null },
    { title: "Реквизиты", key: "details", render: (_: unknown, r: Client) => <Tag color={r.company_details?.length ? "blue" : "default"}>{r.company_details?.length || 0}</Tag> },
    {
      title: "Действия", key: "actions",
      render: (_: unknown, record: Client) => (
        <Space>
          <Button type="link" onClick={() => setDetailClient(record)}><BankOutlined /></Button>
          <Button type="link" onClick={() => openEdit(record)}>Редактировать</Button>
          <Popconfirm title="Удалить клиента?" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button type="link" danger>Удалить</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="nc-toolbar" style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div className="nc-toolbar-left">
          <Input.Search placeholder="Поиск..." allowClear value={entityFilters.search} onChange={(e) => entityFilters.updateSearch(e.target.value)} style={{ width: 250 }} size="small" />
          <button className={`nc-toolbar-btn ${viewMode === "table" ? "active" : ""}`} onClick={() => setViewMode("table")}>
            <UnorderedListOutlined /> Таблица
          </button>
          <button className={`nc-toolbar-btn ${viewMode === "graph" ? "active" : ""}`} onClick={() => setViewMode("graph")}>
            <ApartmentOutlined /> Связи
          </button>
        </div>
        <div className="nc-toolbar-right">
          {selectedRowKeys.length > 0 && (
            <Popconfirm title={`Удалить ${selectedRowKeys.length} ${selectedRowKeys.length === 1 ? "клиента" : "клиентов"}?`} onConfirm={() => bulkDeleteMutation.mutate(selectedRowKeys as number[])}>
              <button className="nc-toolbar-btn" style={{ borderColor: "#ff4d4f", color: "#ff4d4f" }}>
                <DeleteOutlined /> Удалить ({selectedRowKeys.length})
              </button>
            </Popconfirm>
          )}
          <button className="nc-toolbar-btn primary" onClick={openCreate}>
            <PlusOutlined /> Клиент
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <Table
          dataSource={filteredData}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }}
          size="small"
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          onChange={(_pagination, filters, sorter) => {
            entityFilters.updateFilters(filters as Record<string, unknown>);
            const s = Array.isArray(sorter) ? sorter[0] : sorter;
            if (s && s.columnKey && s.order) {
              entityFilters.updateSort(s.columnKey as string, s.order === "ascend" ? "asc" : "desc");
            } else if (s && !s.order) {
              entityFilters.updateSort(null, "asc");
            }
          }}
          onRow={(record) => ({
            onClick: (e) => {
              if ((e.target as HTMLElement).closest("button, .ant-btn")) return;
              setDetailClient(record);
            },
            style: { cursor: "pointer" },
          })}
        />
      ) : (
        <ClientGraph clients={filteredData} orders={orders || []} />
      )}

      <Modal
        title={editing ? "Редактировать клиента" : "Новый клиент"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.validateFields().then(onFinish).catch(() => {})}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Имя" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input /></Form.Item>
          <Form.Item name="phone" label="Телефон"><Input /></Form.Item>
          <Form.Item name="company" label="Компания"><Input /></Form.Item>
          <Form.Item name="address" label="Адрес"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={null}
        open={!!detailClient}
        onClose={() => { setDetailClient(null); setOrderDetail(null); }}
        width={720}
        zIndex={1000}
        styles={{ header: { display: "none" }, body: { paddingTop: 0 } }}
      >
        {detailClient && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #f0f0f0", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
              <Space>
                <Button onClick={() => setDetailClient(null)} icon={<BankOutlined />} type="text" />
                <Typography.Title level={5} style={{ margin: 0 }}>{detailClient.name}</Typography.Title>
              </Space>
              <Space>
                <Button onClick={openCompanyCreate} icon={<PlusOutlined />}>Реквизиты</Button>
                <Button onClick={() => openAttach(detailClient.id)} type="primary">Привязать реквизиты</Button>
                <Button onClick={() => { setDetailClient(null); openEdit(detailClient); }}>Редактировать</Button>
              </Space>
            </div>

            <Descriptions column={3} size="small" style={{ padding: "16px 0" }}>
              <Descriptions.Item label={<><UserOutlined /> Имя</>}>{detailClient.name}</Descriptions.Item>
              <Descriptions.Item label={<><MailOutlined /> Email</>}>{detailClient.email || "—"}</Descriptions.Item>
              <Descriptions.Item label={<><PhoneOutlined /> Телефон</>}>{detailClient.phone || "—"}</Descriptions.Item>
              <Descriptions.Item label={<><BankOutlined /> Компания</>}>{detailClient.company || "—"}</Descriptions.Item>
              <Descriptions.Item label={<><HomeOutlined /> Адрес</>}>{detailClient.address || "—"}</Descriptions.Item>
              <Descriptions.Item label="ID">{detailClient.id}</Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: "8px 0 16px" }} />
            <Typography.Text strong style={{ fontSize: 14 }}>Реквизиты организации</Typography.Text>
            {(detailClient.company_details?.length ?? 0) === 0 ? (
              <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>Нет привязанных реквизитов</Typography.Text>
            ) : (
              <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
                {detailClient.company_details.map((cd) => (
                  <Col span={24} key={cd.id}>
                    <Card
                      size="small"
                      title={<Space size={4}><BankOutlined />{cd.company_name}</Space>}
                      extra={
                        <Space>
                          <Button type="link" size="small" onClick={() => openCompanyEdit(cd)}>Ред.</Button>
                          <Popconfirm title="Отвязать реквизиты?" onConfirm={() => detachMutation.mutate({ clientId: detailClient.id, detailId: cd.id })}>
                            <Button type="link" size="small" danger icon={<DisconnectOutlined />} />
                          </Popconfirm>
                        </Space>
                      }
                    >
                      <Descriptions column={2} size="small">
                        {cd.inn && <Descriptions.Item label="ИНН">{cd.inn}</Descriptions.Item>}
                        {cd.kpp && <Descriptions.Item label="КПП">{cd.kpp}</Descriptions.Item>}
                        {cd.ogrn && <Descriptions.Item label="ОГРН">{cd.ogrn}</Descriptions.Item>}
                        {cd.ogrnip && <Descriptions.Item label="ОГРНИП">{cd.ogrnip}</Descriptions.Item>}
                        {cd.legal_address && <Descriptions.Item label="Юр. адрес" span={2}>{cd.legal_address}</Descriptions.Item>}
                        {cd.actual_address && <Descriptions.Item label="Факт. адрес" span={2}>{cd.actual_address}</Descriptions.Item>}
                        {cd.settlement_account && <Descriptions.Item label="Р/с">{cd.settlement_account}</Descriptions.Item>}
                        {cd.correspondent_account && <Descriptions.Item label="К/с">{cd.correspondent_account}</Descriptions.Item>}
                        {cd.bank_name && <Descriptions.Item label="Банк" span={2}>{cd.bank_name}</Descriptions.Item>}
                        {cd.bik && <Descriptions.Item label="БИК">{cd.bik}</Descriptions.Item>}
                        {cd.contact_person && <Descriptions.Item label="Контакт" span={2}>{cd.contact_person}</Descriptions.Item>}
                        {cd.phone && <Descriptions.Item label="Тел." span={2}>{cd.phone}</Descriptions.Item>}
                        {cd.email && <Descriptions.Item label="Email" span={2}>{cd.email}</Descriptions.Item>}
                      </Descriptions>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}

            <Divider style={{ margin: "16px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>Заказы клиента</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Всего: {clientOrders.length}</Typography.Text>
            </div>
            <Table
              dataSource={clientOrders}
              rowKey="id"
              pagination={false}
              size="small"
              onRow={(record) => ({
                onClick: (e) => {
                  if ((e.target as HTMLElement).closest("button, .ant-btn")) return;
                  setOrderDetail(record);
                },
                style: { cursor: "pointer" },
              })}
              columns={[
                { title: "ID", dataIndex: "id", key: "id", width: 60 },
                {
                  title: "Статус", dataIndex: "status", key: "status", width: 120,
                  render: (v: string) => <Tag color={getColor(statusColors, v)}>{statusLabels[v] || v}</Tag>,
                },
                {
                  title: "Описание", dataIndex: "description", key: "description", ellipsis: true,
                  render: (v: string, r: Order) => v || r.notes || "—",
                },
                {
                  title: "Сумма", dataIndex: "total_price", key: "total_price", width: 100, align: "right",
                  render: (v: number) => v ? `${v.toLocaleString()} ₽` : "—",
                },
                {
                  title: "Дедлайн", dataIndex: "deadline", key: "deadline", width: 110,
                  render: (v: string) => v ? dayjs(v).format("DD.MM.YYYY") : "—",
                },
                {
                  title: "Создан", dataIndex: "created_at", key: "created_at", width: 110,
                  render: (v: string) => dayjs(v).format("DD.MM.YYYY"),
                },
                {
                  title: "Прогресс", dataIndex: "progress", key: "progress", width: 100,
                  render: (v: number) => <Progress percent={v} size="small" status={v === 100 ? "success" : "active"} />,
                },
              ]}
            />
          </>
        )}
      </Drawer>

      <Drawer
        title={`Заказ #${orderDetail?.id || ""}`}
        open={!!orderDetail}
        onClose={() => setOrderDetail(null)}
        width={560}
        zIndex={1010}
        extra={
          orderDetail && (
            <Button onClick={() => { setOrderDetail(null); setDetailClient(null); }}>Закрыть</Button>
          )
        }
      >
        {orderDetail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Клиент">{orderDetail.client_name || `#${orderDetail.client_id}`}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={getColor(statusColors, orderDetail.status)}>{statusLabels[orderDetail.status] || orderDetail.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Сумма">
                <Typography.Text strong style={{ fontSize: 16, color: "#1677ff" }}>{orderDetail.total_price?.toLocaleString()} ₽</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Дедлайн">
                {orderDetail.deadline ? dayjs(orderDetail.deadline).format("DD.MM.YYYY") : "—"}
              </Descriptions.Item>
              {orderDetail.description && <Descriptions.Item label="Описание">{orderDetail.description}</Descriptions.Item>}
              {orderDetail.notes && <Descriptions.Item label="Примечания">{orderDetail.notes}</Descriptions.Item>}
              {orderDetail.designer && (
                <Descriptions.Item label="Дизайнер">
                  <Tag color={getColor(designerColors, orderDetail.designer)}>{orderDetail.designer}</Tag>
                </Descriptions.Item>
              )}
              {orderDetail.workers && orderDetail.workers.length > 0 && (
                <Descriptions.Item label="Работники">
                  {orderDetail.workers.map((w) => <Tag key={w} color={getColor(workerColors, w)}>{w}</Tag>)}
                </Descriptions.Item>
              )}
              {orderDetail.layout_type && <Descriptions.Item label="Макет">{orderDetail.layout_type}</Descriptions.Item>}
              {orderDetail.source && <Descriptions.Item label="Где">{orderDetail.source}</Descriptions.Item>}
            </Descriptions>
            <Divider style={{ margin: "16px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Typography.Text strong>Продукты</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {orderDetail.items.filter((i) => i.is_completed).length} / {orderDetail.items.length} выполнено
              </Typography.Text>
            </div>
            <Progress percent={orderDetail.progress} status={orderDetail.progress === 100 ? "success" : "active"} style={{ marginBottom: 12 }} size="small" />
            <Table
              dataSource={orderDetail.items}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: "", key: "check", width: 40,
                  render: (_: unknown, r: OrderItem) => (
                    <Checkbox checked={r.is_completed} onChange={() => toggleItemMutation.mutate({ orderId: orderDetail.id, itemId: r.id })} />
                  ),
                },
                {
                  title: <PrinterOutlined />, key: "printed", width: 40,
                  render: (_: unknown, r: OrderItem) => (
                    <Tooltip title={r.is_printed ? "Напечатан" : "Не напечатан"}>
                      <Checkbox checked={r.is_printed} disabled={r.is_completed} onChange={() => printedItemMutation.mutate({ orderId: orderDetail.id, itemId: r.id })} />
                    </Tooltip>
                  ),
                },
                {
                  title: "Продукт", dataIndex: "product_name", width: 220, ellipsis: true,
                  render: (v: string, r: OrderItem) => (
                    <Space size={4}>
                      <Typography.Text delete={r.is_completed} type={r.is_completed ? "secondary" : undefined} ellipsis style={{ maxWidth: 180 }}>
                        {v || `#${r.product_id}`}
                      </Typography.Text>
                      {r.is_printed && !r.is_completed && <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>Напечатан</Tag>}
                    </Space>
                  ),
                },
                { title: "Кол-во", dataIndex: "quantity", width: 80 },
                { title: "Ед.", dataIndex: "product_unit", width: 60, render: (v: string) => v || "шт" },
                { title: "Цена", dataIndex: "unit_price", width: 100, render: (v: number) => `${v?.toLocaleString()} ₽` },
                { title: "Сумма", key: "sum", width: 120, render: (_: unknown, r: OrderItem) => `${(r.quantity * r.unit_price).toLocaleString()} ₽` },
              ]}
            />
            <Divider style={{ margin: "16px 0" }} />
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Создан">{dayjs(orderDetail.created_at).format("DD.MM.YYYY HH:mm")}</Descriptions.Item>
              <Descriptions.Item label="Обновлён">{dayjs(orderDetail.updated_at).format("DD.MM.YYYY HH:mm")}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>

      <Modal
        title={editingCompany ? "Редактировать реквизиты" : "Новые реквизиты"}
        open={companyModalOpen}
        onCancel={() => { setCompanyModalOpen(false); setEditingCompany(null); }}
        onOk={() => companyForm.validateFields().then(onCompanyFinish).catch(() => {})}
        confirmLoading={createCompanyMutation.isPending || updateCompanyMutation.isPending}
        width={640}
      >
        <Form form={companyForm} layout="vertical" onFinish={onCompanyFinish}>
          <Form.Item label="Быстрый ввод реквизитов">
            <Input.TextArea
              rows={3}
              value={requisiteText}
              onChange={(e) => setRequisiteText(e.target.value)}
              placeholder={"Вставьте реквизиты одним блоком, например:\nООО «Рога и Копыта\"\nИНН 7701234567 КПП 770101001\nОГРН 1027700132195\nР/с 40702810100000000001\nБанк ПАО Сбербанк БИК 044525225\nК/с 30101810400000000225"}
            />
            <Button size="small" type="link" onClick={parseRequisites} disabled={!requisiteText.trim()}>Распознать реквизиты</Button>
          </Form.Item>
          <Divider style={{ margin: "4px 0 12px" }} />
          <Form.Item name="company_name" label="Название организации" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="inn" label="ИНН"><Input maxLength={12} /></Form.Item></Col>
            <Col span={8}><Form.Item name="kpp" label="КПП"><Input maxLength={9} /></Form.Item></Col>
            <Col span={8}><Form.Item name="ogrn" label="ОГРН"><Input maxLength={15} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="ogrnip" label="ОГРНИП"><Input maxLength={15} /></Form.Item></Col>
          </Row>
          <Form.Item name="legal_address" label="Юридический адрес"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="actual_address" label="Фактический адрес"><Input.TextArea rows={2} /></Form.Item>
          <Divider style={{ margin: "8px 0" }} />
          <Row gutter={16}>
            <Col span={12}><Form.Item name="settlement_account" label="Расчётный счёт"><Input maxLength={20} /></Form.Item></Col>
            <Col span={12}><Form.Item name="correspondent_account" label="Корр. счёт"><Input maxLength={20} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={16}><Form.Item name="bank_name" label="Наименование банка"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="bik" label="БИК"><Input maxLength={9} /></Form.Item></Col>
          </Row>
          <Divider style={{ margin: "8px 0" }} />
          <Row gutter={16}>
            <Col span={12}><Form.Item name="contact_person" label="Контактное лицо"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="Телефон"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="email" label="Email"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Привязать реквизиты"
        open={attachModalOpen}
        onCancel={() => setAttachModalOpen(false)}
        footer={null}
        width={500}
      >
        <Typography.Paragraph type="secondary">Выберите реквизиты для привязки к клиенту:</Typography.Paragraph>
        {(allCompanyDetails ?? []).map((cd) => (
          <Card
            key={cd.id}
            size="small"
            style={{ marginBottom: 8 }}
            hoverable
            onClick={() => { if (attachClientId) attachMutation.mutate({ clientId: attachClientId, detailId: cd.id }); }}
          >
            <Space>
              <BankOutlined />
              <Typography.Text strong>{cd.company_name}</Typography.Text>
              {cd.inn && <Typography.Text type="secondary">ИНН: {cd.inn}</Typography.Text>}
            </Space>
          </Card>
        ))}
        {(allCompanyDetails ?? []).length === 0 && <Typography.Text type="secondary">Нет доступных реквизитов. Сначала создайте их.</Typography.Text>}
      </Modal>
    </>
  );
}
