import {
  BankOutlined, UserOutlined, MailOutlined, PhoneOutlined, HomeOutlined, PrinterOutlined,
} from "@ant-design/icons";
import {
  Button, Card, Checkbox, Col, Descriptions, Divider, Drawer, Progress,
  Row, Space, Table, Tag, Tooltip, Typography,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Client, Order, OrderItem } from "../types";

interface GraphNode {
  id: string;
  label: string;
  type: "client" | "detail" | "order";
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  data: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface Props {
  clients: Client[];
  orders: Order[];
  width?: number;
  height?: number;
}

const COLORS = {
  client: "#1677ff",
  detail: "#52c41a",
  order: "#fa8c16",
  clientLight: "#e6f4ff",
  detailLight: "#f6ffed",
  orderLight: "#fff7e6",
  edge: "#d9d9d9",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Новый", in_progress: "В работе", ready: "Готов", delivered: "Отдали",
};

const STATUS_COLORS: Record<string, string> = {
  new: "blue", in_progress: "orange", ready: "green", delivered: "default",
};

function getColor(map: Record<string, string>, name: string) {
  if (map[name]) return map[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 50%)`;
}

export default function ClientGraph({ clients, orders, width = 900, height = 650 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const animRef = useRef<number>(0);

  const buildGraph = useCallback(() => {
    const nodeList: GraphNode[] = [];
    const edgeList: GraphEdge[] = [];
    const cx = width / 2;
    const cy = height / 2;

    const clientIds = new Set(clients.map((c) => c.id));
    const visibleOrders = orders.filter((o) => clientIds.has(o.client_id) || o.clients?.some((cl) => clientIds.has(cl.id)));

    const clientNodes: GraphNode[] = clients.map((c, i) => {
      const angle = (2 * Math.PI * i) / clients.length;
      const r = Math.min(width, height) * 0.38;
      const orderCount = visibleOrders.filter((o) => o.client_id === c.id || o.clients?.some((cl) => cl.id === c.id)).length;
      const totalSum = visibleOrders.filter((o) => o.client_id === c.id || o.clients?.some((cl) => cl.id === c.id)).reduce((s, o) => s + o.total_price, 0);
      return {
        id: `client-${c.id}`,
        label: c.name,
        type: "client",
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        vx: 0,
        vy: 0,
        color: COLORS.client,
        radius: 30 + Math.min(orderCount, 8) * 2,
        data: { ...c, orderCount, totalSum } as unknown as Record<string, unknown>,
      };
    });

    const detailMap = new Map<string, GraphNode>();
    for (const c of clients) {
      const clientNode = clientNodes.find((n) => n.id === `client-${c.id}`);
      for (const d of c.company_details || []) {
        const key = `detail-${d.id}`;
        if (!detailMap.has(key)) {
          const idx = detailMap.size + clients.length;
          const angle = (2 * Math.PI * idx) / (clients.length + clients.reduce((s, cl) => s + (cl.company_details?.length || 0), 0));
          const r = Math.min(width, height) * 0.18;
          const baseX = clientNode ? clientNode.x : cx;
          const baseY = clientNode ? clientNode.y : cy;
          detailMap.set(key, {
            id: key,
            label: d.company_name,
            type: "detail",
            x: baseX + r * Math.cos(angle) + (Math.random() - 0.5) * 60,
            y: baseY + r * Math.sin(angle) + (Math.random() - 0.5) * 60,
            vx: 0,
            vy: 0,
            color: COLORS.detail,
            radius: 18,
            data: d as unknown as Record<string, unknown>,
          });
        }
        edgeList.push({ source: `client-${c.id}`, target: key });
      }
    }

    const clientMap = new Map(clients.map((c) => [c.id, `client-${c.id}`]));
    for (const o of visibleOrders) {
      const orderClientIds = new Set<number>([o.client_id]);
      if (o.clients) o.clients.forEach((cl) => orderClientIds.add(cl.id));

      const primaryClientId = clientMap.get(o.client_id);
      const primaryClientNode = primaryClientId ? clientNodes.find((n) => n.id === primaryClientId) : null;
      const baseX = primaryClientNode ? primaryClientNode.x : cx;
      const baseY = primaryClientNode ? primaryClientNode.y : cy;
      const angle = (2 * Math.PI * Math.random());
      const r = Math.min(width, height) * 0.06 + Math.random() * 40;
      const orderNode: GraphNode = {
        id: `order-${o.id}`,
        label: `#${o.id} ${STATUS_LABELS[o.status] || o.status}`,
        type: "order",
        x: baseX + r * Math.cos(angle) + (Math.random() - 0.5) * 50,
        y: baseY + r * Math.sin(angle) + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        color: COLORS.order,
        radius: 18,
        data: o as unknown as Record<string, unknown>,
      };
      nodeList.push(orderNode);
      for (const cid of orderClientIds) {
        const edgeClientId = clientMap.get(cid);
        if (edgeClientId) edgeList.push({ source: edgeClientId, target: orderNode.id });
      }
    }

    nodeList.push(...clientNodes, ...detailMap.values());
    setNodes(nodeList);
    setEdges(edgeList);
    nodesRef.current = nodeList;
  }, [clients, orders, width, height]);

  useEffect(() => { buildGraph(); }, [buildGraph]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const simulate = () => {
      const ns = nodesRef.current;
      const alpha = 0.3;
      const repulsion = 6000;
      const attraction = 0.004;
      const centerPull = 0.005;
      const damping = 0.82;
      const cx = width / 2;
      const cy = height / 2;

      for (const n of ns) {
        if (n.id === dragging) continue;
        n.vx += (cx - n.x) * centerPull;
        n.vy += (cy - n.y) * centerPull;
      }

      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i]; const b = ns[j];
          let dx = b.x - a.x; let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (repulsion * alpha) / (dist * dist);
          const fx = (dx / dist) * force; const fy = (dy / dist) * force;
          if (a.id !== dragging) { a.vx -= fx; a.vy -= fy; }
          if (b.id !== dragging) { b.vx += fx; b.vy += fy; }
        }
      }

      const nodeMap = new Map(ns.map((n) => [n.id, n]));
      for (const e of edges) {
        const a = nodeMap.get(e.source); const b = nodeMap.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * attraction * alpha;
        const fx = (dx / dist) * force; const fy = (dy / dist) * force;
        if (a.id !== dragging) { a.vx += fx; a.vy += fy; }
        if (b.id !== dragging) { b.vx -= fx; b.vy -= fy; }
      }

      for (const n of ns) {
        if (n.id === dragging) continue;
        n.vx *= damping; n.vy *= damping;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.radius + 10, Math.min(width - n.radius - 10, n.x));
        n.y = Math.max(n.radius + 10, Math.min(height - n.radius - 10, n.y));
      }

      setNodes([...ns]);
      animRef.current = requestAnimationFrame(simulate);
    };
    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes.length, edges, width, height, dragging]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ns = nodesRef.current;
    const node = ns.find((n) => n.id === dragging);
    if (node) {
      node.x = e.clientX - rect.left;
      node.y = e.clientY - rect.top;
      node.vx = 0; node.vy = 0;
      setNodes([...ns]);
    }
  }, [dragging]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const detailClient = selected?.type === "client" ? (selected.data as unknown as Client) : null;
  const detailOrderNode = selected?.type === "order" ? (selected.data as unknown as Order) : null;
  const detailRequisite = selected?.type === "detail" ? (selected.data as Record<string, string>) : null;

  const clientOrders = detailClient
    ? orders.filter((o) => o.client_id === detailClient.id || o.clients?.some((c) => c.id === detailClient.id)).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];

  const activeOrder = orderDetail || detailOrderNode;

  return (
    <>
      <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden", background: "#fafafa" }}>
        <svg ref={svgRef} width={width} height={height}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setDragging(null)}
          onMouseLeave={() => setDragging(null)}
          style={{ display: "block" }}>
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
            </filter>
          </defs>

          {edges.map((e, i) => {
            const s = nodeMap.get(e.source); const t = nodeMap.get(e.target);
            if (!s || !t) return null;
            const active = hovered === e.source || hovered === e.target;
            return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke={active ? "#1677ff" : COLORS.edge} strokeWidth={active ? 2.5 : 1.5}
              strokeDasharray={active ? "none" : "4,3"} />;
          })}

          {nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}
              onMouseDown={() => setDragging(n.id)}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(n)}
              style={{ cursor: dragging === n.id ? "grabbing" : "pointer" }}>
              <circle r={n.radius}
                fill={n.type === "client" ? COLORS.clientLight : n.type === "detail" ? COLORS.detailLight : COLORS.orderLight}
                stroke={n.color} strokeWidth={hovered === n.id || selected?.id === n.id ? 3 : 2}
                filter="url(#shadow)" />
              <text textAnchor="middle" dominantBaseline="middle"
                fill={n.type === "client" ? COLORS.client : n.type === "detail" ? "#389e0d" : "#d46b08"}
                fontSize={n.type === "order" ? 9 : 10} fontWeight={n.type === "client" ? 600 : 400}
                style={{ pointerEvents: "none", userSelect: "none" }}>
                {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
              </text>
              {n.type === "client" && (
                <>
                  <text textAnchor="middle" y={n.radius + 13} fill="#8c8c8c" fontSize={9}
                    style={{ pointerEvents: "none", userSelect: "none" }}>клиент</text>
                  <text textAnchor="middle" y={n.radius + 24} fill="#1677ff" fontSize={8} fontWeight={600}
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    {`${(n.data as Record<string, unknown>).orderCount ?? 0} зак.`}
                  </text>
                </>
              )}
              {n.type === "order" && (
                <text textAnchor="middle" y={n.radius + 12} fill="#8c8c8c" fontSize={9}
                  style={{ pointerEvents: "none", userSelect: "none" }}>заказ</text>
              )}
            </g>
          ))}
        </svg>
      </div>

      <Drawer
        title={null}
        open={!!selected && (selected.type === "client" || selected.type === "detail")}
        onClose={() => { setSelected(null); setOrderDetail(null); }}
        width={720}
        zIndex={1000}
        styles={{ header: { display: "none" }, body: { paddingTop: 0 } }}
      >
        {detailClient && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #f0f0f0", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
              <Space>
                <Button onClick={() => setSelected(null)} icon={<BankOutlined />} type="text" />
                <Typography.Title level={5} style={{ margin: 0 }}>{detailClient.name}</Typography.Title>
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
                  render: (v: string) => <Tag color={getColor(STATUS_COLORS, v)}>{STATUS_LABELS[v] || v}</Tag>,
                },
                {
                  title: "Описание", dataIndex: "description", key: "description", ellipsis: true,
                  render: (v: string, r: Order) => { let d = v; if (d?.trim().startsWith("{")) try { d = JSON.parse(d).text; } catch {} return d || r.notes || "—"; },
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

        {detailRequisite && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #f0f0f0", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
              <Space>
                <Button onClick={() => setSelected(null)} icon={<BankOutlined />} type="text" />
                <Typography.Title level={5} style={{ margin: 0 }}>Реквизиты: {String(detailRequisite.company_name)}</Typography.Title>
              </Space>
            </div>
            <Descriptions column={2} bordered size="small" style={{ padding: "16px 0" }}>
              {detailRequisite.inn && <Descriptions.Item label="ИНН">{String(detailRequisite.inn)}</Descriptions.Item>}
              {detailRequisite.kpp && <Descriptions.Item label="КПП">{String(detailRequisite.kpp)}</Descriptions.Item>}
              {detailRequisite.ogrn && <Descriptions.Item label="ОГРН">{String(detailRequisite.ogrn)}</Descriptions.Item>}
              {detailRequisite.ogrnip && <Descriptions.Item label="ОГРНИП">{String(detailRequisite.ogrnip)}</Descriptions.Item>}
              {detailRequisite.legal_address && <Descriptions.Item label="Юр. адрес" span={2}>{String(detailRequisite.legal_address)}</Descriptions.Item>}
              {detailRequisite.actual_address && <Descriptions.Item label="Факт. адрес" span={2}>{String(detailRequisite.actual_address)}</Descriptions.Item>}
              {detailRequisite.settlement_account && <Descriptions.Item label="Р/с">{String(detailRequisite.settlement_account)}</Descriptions.Item>}
              {detailRequisite.correspondent_account && <Descriptions.Item label="К/с">{String(detailRequisite.correspondent_account)}</Descriptions.Item>}
              {detailRequisite.bank_name && <Descriptions.Item label="Банк" span={2}>{String(detailRequisite.bank_name)}</Descriptions.Item>}
              {detailRequisite.bik && <Descriptions.Item label="БИК">{String(detailRequisite.bik)}</Descriptions.Item>}
              {detailRequisite.contact_person && <Descriptions.Item label="Контакт" span={2}>{String(detailRequisite.contact_person)}</Descriptions.Item>}
              {detailRequisite.phone && <Descriptions.Item label="Тел." span={2}>{String(detailRequisite.phone)}</Descriptions.Item>}
              {detailRequisite.email && <Descriptions.Item label="Email" span={2}>{String(detailRequisite.email)}</Descriptions.Item>}
            </Descriptions>
          </>
        )}
      </Drawer>

      <Drawer
        title={`Заказ #${activeOrder?.id || ""}`}
        open={!!activeOrder}
        onClose={() => { setOrderDetail(null); if (selected?.type === "order") setSelected(null); }}
        width={560}
        zIndex={1010}
        extra={
          <Button onClick={() => { setOrderDetail(null); if (selected?.type === "order") setSelected(null); }}>Закрыть</Button>
        }
      >
        {activeOrder && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Клиент">{activeOrder.client_name || `#${activeOrder.client_id}`}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={getColor(STATUS_COLORS, activeOrder.status)}>{STATUS_LABELS[activeOrder.status] || activeOrder.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Сумма">
                <Typography.Text strong style={{ fontSize: 16, color: "#1677ff" }}>{activeOrder.total_price?.toLocaleString()} ₽</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Дедлайн">
                {activeOrder.deadline ? dayjs(activeOrder.deadline).format("DD.MM.YYYY") : "—"}
              </Descriptions.Item>
              {activeOrder.description && (() => { let d = activeOrder.description; if (d.trim().startsWith("{")) try { d = JSON.parse(d).text; } catch {} return d; })() && <Descriptions.Item label="Описание">{(() => { let d = activeOrder.description; if (d.trim().startsWith("{")) try { d = JSON.parse(d).text; } catch {} return d; })()}</Descriptions.Item>}
              {activeOrder.notes && <Descriptions.Item label="Примечания">{activeOrder.notes}</Descriptions.Item>}
              {activeOrder.designer && <Descriptions.Item label="Дизайнер">{activeOrder.designer}</Descriptions.Item>}
              {activeOrder.workers && activeOrder.workers.length > 0 && (
                <Descriptions.Item label="Работники">
                  {activeOrder.workers.map((w) => <Tag key={w} color={getColor({}, w)}>{w}</Tag>)}
                </Descriptions.Item>
              )}
              {activeOrder.layout_type && <Descriptions.Item label="Макет">{activeOrder.layout_type}</Descriptions.Item>}
              {activeOrder.source && <Descriptions.Item label="Где">{activeOrder.source}</Descriptions.Item>}
            </Descriptions>
            <Divider style={{ margin: "16px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Typography.Text strong>Продукты</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {activeOrder.items.filter((i) => i.is_completed).length} / {activeOrder.items.length} выполнено
              </Typography.Text>
            </div>
            <Progress percent={activeOrder.progress} status={activeOrder.progress === 100 ? "success" : "active"} style={{ marginBottom: 12 }} size="small" />
            <Table
              dataSource={activeOrder.items}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: "", key: "check", width: 40,
                  render: (_: unknown, r: OrderItem) => (
                    <Checkbox checked={r.is_completed} />
                  ),
                },
                {
                  title: <PrinterOutlined />, key: "printed", width: 40,
                  render: (_: unknown, r: OrderItem) => (
                    <Tooltip title={r.is_printed ? "Напечатан" : "Не напечатан"}>
                      <Checkbox checked={r.is_printed} disabled={r.is_completed} />
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
              <Descriptions.Item label="Создан">{dayjs(activeOrder.created_at).format("DD.MM.YYYY HH:mm")}</Descriptions.Item>
              <Descriptions.Item label="Обновлён">{dayjs(activeOrder.updated_at).format("DD.MM.YYYY HH:mm")}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>
    </>
  );
}
