import {
  AppstoreOutlined,
  TeamOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  CalculatorOutlined,
  InboxOutlined,
  BookOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Popover, Space, Tooltip, Typography } from "antd";
import { type ReactNode, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMenuOrder } from "../hooks/useMenuOrder";

interface NavItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
}

const defaultNavItems: NavItem[] = [
  { key: "/", icon: <AppstoreOutlined />, label: "Дашборд", tooltip: "Дашборд" },
  { key: "/clients", icon: <TeamOutlined />, label: "Клиенты", tooltip: "Клиенты" },
  { key: "/products", icon: <ShopOutlined />, label: "Продукты", tooltip: "Продукты" },
  { key: "/orders", icon: <ShoppingCartOutlined />, label: "Заказы", tooltip: "Заказы" },
  { key: "/warehouse", icon: <DatabaseOutlined />, label: "Склад", tooltip: "Склад" },
  { key: "/raw-materials", icon: <TagsOutlined />, label: "Сырьё", tooltip: "Сырьё" },
  { key: "/calculator", icon: <CalculatorOutlined />, label: "Калькулятор", tooltip: "Калькулятор" },
  { key: "/archive", icon: <InboxOutlined />, label: "Хранилище", tooltip: "Хранилище" },
  { key: "/knowledge", icon: <BookOutlined />, label: "База знаний", tooltip: "База знаний" },
  { key: "/settings", icon: <SettingOutlined />, label: "Настройки", tooltip: "Настройки" },
];

export default function NocodbLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navItems = user?.is_superuser ? defaultNavItems : defaultNavItems.filter((i) => i.key !== "/settings");
  const { orderedItems, moveUp, moveDown, reset, order } = useMenuOrder(navItems);

  const activeItem = useMemo(
    () => orderedItems.find((item) => item.key === location.pathname)?.key || "/",
    [location.pathname, orderedItems]
  );

  const activeLabel = useMemo(
    () => orderedItems.find((item) => item.key === activeItem)?.label || "Типография CRM",
    [activeItem, orderedItems]
  );

  const userMenu = (
    <div style={{ minWidth: 160 }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>
        <Typography.Text strong style={{ fontSize: 13 }}>{user?.full_name || user?.username}</Typography.Text>
        <br />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>{user?.email}</Typography.Text>
      </div>
      <div
        style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13 }}
        onClick={() => navigate("/settings")}
      >
        <SettingOutlined style={{ marginRight: 8 }} /> Настройки
      </div>
      <div
        style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#ff4d4f" }}
        onClick={logout}
      >
        <LogoutOutlined style={{ marginRight: 8 }} /> Выйти
      </div>
    </div>
  );

  const menuSettingsContent = (
    <div style={{ minWidth: 200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Text strong>Порядок меню</Typography.Text>
        <Button type="link" size="small" onClick={reset}>Сбросить</Button>
      </div>
      {orderedItems.map((item, idx) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 0",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Space size={8}>
            {item.icon}
            <Typography.Text style={{ fontSize: 13 }}>{item.label}</Typography.Text>
          </Space>
          <Space size={2}>
            <Button type="text" size="small" disabled={idx === 0} onClick={() => moveUp(item.key)}>
              ↑
            </Button>
            <Button type="text" size="small" disabled={idx === orderedItems.length - 1} onClick={() => moveDown(item.key)}>
              ↓
            </Button>
          </Space>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* NocoDB-style minibar */}
      <div className="nc-minibar">
        <div className="nc-minibar-logo" onClick={() => navigate("/")}>
          Т
        </div>

        <div className="nc-minibar-items">
          {orderedItems.map((item) => (
            <Tooltip key={item.key} title={item.tooltip} placement="right">
              <button
                className={`nc-minibar-item ${activeItem === item.key ? "active" : ""}`}
                onClick={() => navigate(item.key)}
              >
                {item.icon}
              </button>
            </Tooltip>
          ))}
        </div>

        <div className="nc-minibar-bottom">
          <Popover content={menuSettingsContent} title="Настройка меню" trigger="click" placement="right">
            <Tooltip title="Настроить меню" placement="right">
              <button className="nc-minibar-item">
                <MenuUnfoldOutlined />
              </button>
            </Tooltip>
          </Popover>
          <Tooltip title="Выйти" placement="right">
            <button className="nc-minibar-item" onClick={logout}>
              <LogoutOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Main content */}
      <div className="nc-main">
        {/* Header */}
        <div className="nc-header">
          <div className="nc-header-left">
            <Typography.Text className="nc-header-title">{activeLabel}</Typography.Text>
          </div>
          <div className="nc-header-right">
            <Dropdown dropdownRender={() => userMenu} trigger={["click"]} placement="bottomRight">
              <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#3b82f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {(user?.username || "U")[0].toUpperCase()}
                </div>
                <Typography.Text style={{ fontSize: 13 }}>{user?.username}</Typography.Text>
              </div>
            </Dropdown>
          </div>
        </div>

        {/* Content */}
        <div className="nc-content">
          {children}
        </div>
      </div>
    </div>
  );
}
