import { DatabaseOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useState } from "react";
import { getOrderSettings } from "../api/orderSettings";
import { getOrders, toggleItemCompleted, toggleItemPrinted } from "../api/orders";
import { getProducts } from "../api/products";
import { getWarehouseItems } from "../api/warehouse";
import { useAuth } from "../hooks/useAuth";
import { useEntityFilters } from "../hooks/useEntityFilters";
import AIAssistant from "../components/AIAssistant";
import type { Order, OrderItem, OrderSettingsItem } from "../types";

const { RangePicker } = DatePicker;

const statusLabels: Record<string, string> = {
  new: "Новый", in_progress: "В работе", ready: "Готов", delivered: "Отдали",
};

function parsePaths(raw: string | undefined): string[] {
  if (!raw) return [];
  const parts = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  const expanded: string[] = [];
  for (const part of parts) {
    const subParts = part.split(/(?=\\\\)/).filter(Boolean);
    expanded.push(...subParts);
  }
  return expanded;
}

export default function ArchivePage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canViewPrices = hasPermission("prices.view");
  const canViewRevenue = hasPermission("prices.revenue");

  const ef = useEntityFilters("archive");
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  const clientFilter = (ef.filters.client as string) || null;
  const dateRangeRaw = ef.filters.dateRange as [string, string] | null;
  const dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null = dateRangeRaw
    ? [dayjs(dateRangeRaw[0]), dayjs(dateRangeRaw[1])]
    : null;

  const setClientFilter = (v: string | null) => ef.updateFilters({ ...ef.filters, client: v });
  const setDateRange = (v: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    ef.updateFilters({
      ...ef.filters,
      dateRange: v ? [v[0]?.toISOString() || null, v[1]?.toISOString() || null] : null,
    });
  };

  const { data: orders } = useQuery({ queryKey: ["orders"], queryFn: getOrders, refetchInterval: 15000 });
  const { data: designerColors } = useQuery<OrderSettingsItem[]>({ queryKey: ["orderSettings", "designer_color"], queryFn: () => getOrderSettings("designer_color") });
  const { data: workerColors } = useQuery<OrderSettingsItem[]>({ queryKey: ["orderSettings", "worker_color"], queryFn: () => getOrderSettings("worker_color") });
  const { data: layoutOptions } = useQuery<OrderSettingsItem[]>({ queryKey: ["orderSettings", "layout"], queryFn: () => getOrderSettings("layout") });
  const { data: sourceOptions } = useQuery<OrderSettingsItem[]>({ queryKey: ["orderSettings", "source"], queryFn: () => getOrderSettings("source") });
  const { data: statusSettings } = useQuery<OrderSettingsItem[]>({ queryKey: ["orderSettings", "status_color"], queryFn: () => getOrderSettings("status_color") });

  const getColor = (settings: OrderSettingsItem[] | undefined, name: string): string => {
    return (settings ?? []).find((s) => s.name === name)?.color || "#1677ff";
  };

  const statusColorMap: Record<string, string> = {};
  (statusSettings ?? []).forEach((s) => {
    const key = Object.entries(statusLabels).find(([_, v]) => v === s.name)?.[0];
    if (key) statusColorMap[key] = s.color;
  });

  const toggleMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) =>
      toggleItemCompleted(orderId, itemId),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.fetchQuery<Order[]>({ queryKey: ["orders"], queryFn: getOrders }).then((data) => {
        const updated = data?.find((o) => o.id === vars.orderId);
        if (updated) setDetailOrder(updated);
      });
    },
  });

  const printedMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) =>
      toggleItemPrinted(orderId, itemId),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.fetchQuery<Order[]>({ queryKey: ["orders"], queryFn: getOrders }).then((data) => {
        const updated = data?.find((o) => o.id === vars.orderId);
        if (updated) setDetailOrder(updated);
      });
    },
  });

  const allOrders = orders ?? [];
  const deliveredOrders = allOrders.filter((o) => o.status === "delivered");
  const totalRevenue = deliveredOrders.reduce((s, o) => s + o.total_price, 0);

  const filteredOrders = deliveredOrders.filter((o) => {
    if (clientFilter && o.client_name !== clientFilter) return false;
    if (dateRange?.[0] && dayjs(o.created_at).isBefore(dateRange[0].startOf("day"))) return false;
    if (dateRange?.[1] && dayjs(o.created_at).isAfter(dateRange[1].endOf("day"))) return false;
    return true;
  });

  const clientNames = [...new Set(deliveredOrders.map((o) => o.client_name).filter(Boolean))];

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60, sorter: (a: Order, b: Order) => a.id - b.id },
    { title: "Клиент", dataIndex: "client_name", key: "client" },
    { title: "Описание", key: "desc", render: (_: unknown, r: Order) => r.description || r.items?.map((i) => i.product_name).join(", ") || "—" },
    ...(canViewPrices ? [{ title: "Сумма", dataIndex: "total_price", key: "price", render: (v: number) => <span className="nc-price">{v.toLocaleString()} ₽</span>, sorter: (a: Order, b: Order) => a.total_price - b.total_price }] : []),
    {
      title: "Статус", dataIndex: "status", key: "status", width: 120,
      render: (s: string) => (
        <Tag color={statusColorMap[s] || "#d9d9d9"} style={{ margin: 0 }}>
          {statusLabels[s] || s}
        </Tag>
      ),
    },
    {
      title: "Дата", dataIndex: "created_at", key: "created_at",
      render: (v: string) => dayjs(v).format("DD.MM.YYYY"),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={12} lg={8}>
          <Card size="small" style={{ borderTop: "3px solid #8c8c8c" }}>
            <Statistic
              title="Отдано заказов"
              value={deliveredOrders.length}
              prefix={<DatabaseOutlined />}
              valueStyle={{ fontSize: 24, fontWeight: 600 }}
            />
          </Card>
        </Col>
        {canViewRevenue && (
        <Col xs={12} sm={12} lg={8}>
          <Card size="small" style={{ borderTop: "3px solid #f59e0b" }}>
            <Statistic
              title="Общая сумма"
              value={totalRevenue.toLocaleString()}
              suffix="₽"
              precision={0}
              valueStyle={{ fontSize: 24, fontWeight: 600, color: "#f59e0b" }}
            />
          </Card>
        </Col>
        )}

        <Col span={24}>
          <Card
            size="small"
            title={
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Typography.Text strong style={{ fontSize: 13 }}>Хранилище</Typography.Text>
                <Select
                  allowClear
                  showSearch
                  placeholder="Клиент"
                  size="small"
                  value={clientFilter}
                  onChange={setClientFilter}
                  style={{ width: 160 }}
                  options={clientNames.map((n) => ({ label: n, value: n }))}
                />
                <RangePicker
                  size="small"
                  value={dateRange as [dayjs.Dayjs, dayjs.Dayjs] | null}
                  onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                  placeholder={["От", "До"]}
                />
              </div>
            }
          >
            <Table
              dataSource={filteredOrders}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Всего: ${t}` }}
              size="small"
              scroll={{ x: "max-content" }}
              onRow={(record) => ({
                onClick: () => setDetailOrder(record),
                style: { cursor: "pointer" },
              })}
            />
          </Card>
        </Col>
      </Row>

      <Drawer
        title={`Заказ #${detailOrder?.id || ""}`}
        open={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        width={560}
      >
        {detailOrder && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Клиент">{detailOrder.client_name || `#${detailOrder.client_id}`}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={statusColorMap[detailOrder.status] || "#d9d9d9"}>{statusLabels[detailOrder.status] || detailOrder.status}</Tag>
              </Descriptions.Item>
              {canViewPrices && (
              <Descriptions.Item label="Сумма">
                <Typography.Text strong style={{ fontSize: 16, color: "#1677ff" }}>{detailOrder.total_price.toLocaleString()} ₽</Typography.Text>
              </Descriptions.Item>
              )}
              <Descriptions.Item label="Дедлайн">
                {detailOrder.deadline ? dayjs(detailOrder.deadline).format("DD.MM.YYYY") : "—"}
              </Descriptions.Item>
              {detailOrder.description && (
                <Descriptions.Item label="Описание">{detailOrder.description}</Descriptions.Item>
              )}
              {detailOrder.notes && (
                <Descriptions.Item label="Примечания">{detailOrder.notes}</Descriptions.Item>
              )}
              {detailOrder.designer && (
                <Descriptions.Item label="Дизайнер">
                  <Tag color={getColor(designerColors, detailOrder.designer)}>{detailOrder.designer}</Tag>
                </Descriptions.Item>
              )}
              {detailOrder.workers && detailOrder.workers.length > 0 && (
                <Descriptions.Item label="Работники">
                  {detailOrder.workers.map((w) => <Tag key={w} color={getColor(workerColors, w)}>{w}</Tag>)}
                </Descriptions.Item>
              )}
              {detailOrder.layout_type && (
                <Descriptions.Item label="Макет">
                  <Tag color={getColor(layoutOptions, detailOrder.layout_type)}>{detailOrder.layout_type}</Tag>
                </Descriptions.Item>
              )}
              {detailOrder.source && (
                <Descriptions.Item label="Где">
                  <Tag color={getColor(sourceOptions, detailOrder.source)}>{detailOrder.source}</Tag>
                </Descriptions.Item>
              )}
              {detailOrder.path && (
                <Descriptions.Item label="Путь">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {parsePaths(detailOrder.path).map((p, i) => (
                      <Typography.Text key={i} style={{ fontSize: 12, wordBreak: "break-all" }}>{p}</Typography.Text>
                    ))}
                  </div>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider style={{ margin: "16px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Typography.Text strong>Продукты</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {detailOrder.items.filter((i) => i.is_completed).length} / {detailOrder.items.length} выполнено
              </Typography.Text>
            </div>
            <Progress
              percent={detailOrder.progress}
              status={detailOrder.progress === 100 ? "success" : "active"}
              style={{ marginBottom: 12 }}
              size="small"
            />
            <Table
              dataSource={detailOrder.items}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: "", key: "check", width: 40,
                  render: (_: unknown, r: OrderItem) => (
                    <Checkbox
                      checked={r.is_completed}
                      onChange={() => toggleMutation.mutate({ orderId: detailOrder.id, itemId: r.id })}
                    />
                  ),
                },
                {
                  title: <PrinterOutlined />, key: "printed", width: 40,
                  render: (_: unknown, r: OrderItem) => (
                    <Tooltip title={r.is_printed ? "Напечатан" : "Не напечатан"}>
                      <Checkbox
                        checked={r.is_printed}
                        disabled={r.is_completed}
                        onChange={() => printedMutation.mutate({ orderId: detailOrder.id, itemId: r.id })}
                      />
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
                      {r.is_printed && !r.is_completed && (
                        <Tag color="orange" style={{ margin: 0, fontSize: 11, flexShrink: 0 }}>Напечатан</Tag>
                      )}
                    </Space>
                  ),
                },
                { title: "Кол-во", dataIndex: "quantity", width: 80 },
                { title: "Ед.", dataIndex: "product_unit", width: 60, render: (v: string) => v || "шт" },
                ...(canViewPrices ? [
                  { title: "Цена", dataIndex: "unit_price", width: 100, render: (v: number) => `${v.toLocaleString()} ₽` },
                  { title: "Сумма", key: "sum", width: 120, render: (_: unknown, r: OrderItem) => `${(r.quantity * r.unit_price).toLocaleString()} ₽` },
                ] : []),
              ]}
            />

            <Divider style={{ margin: "16px 0" }} />
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Создан">{dayjs(detailOrder.created_at).format("DD.MM.YYYY HH:mm")}</Descriptions.Item>
              <Descriptions.Item label="Обновлён">{dayjs(detailOrder.updated_at).format("DD.MM.YYYY HH:mm")}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>

      <AIAssistant />
    </div>
  );
}
