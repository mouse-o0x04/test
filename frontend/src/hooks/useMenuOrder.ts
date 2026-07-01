import { useCallback, useState } from "react";

export interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  tooltip?: string;
  alwaysShow?: boolean;
}

const STORAGE_KEY = "crm_menu_order";

const defaultOrder = ["/", "/clients", "/products", "/orders", "/warehouse", "/raw-materials", "/calculator", "/archive", "/knowledge", "/settings"];

export function useMenuOrder(items: MenuItem[]) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const valid = parsed.filter((k) => items.some((i) => i.key === k));
        const missing = items.filter((i) => !valid.includes(i.key)).map((i) => i.key);
        return [...valid, ...missing];
      }
    } catch { /* ignore */ }
    return defaultOrder;
  });

  const save = useCallback((newOrder: string[]) => {
    setOrder(newOrder);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder));
  }, []);

  const moveUp = useCallback((key: string) => {
    const idx = order.indexOf(key);
    if (idx <= 0) return;
    const newOrder = [...order];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    save(newOrder);
  }, [order, save]);

  const moveDown = useCallback((key: string) => {
    const idx = order.indexOf(key);
    if (idx < 0 || idx >= order.length - 1) return;
    const newOrder = [...order];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    save(newOrder);
  }, [order, save]);

  const reset = useCallback(() => {
    save(defaultOrder);
  }, [save]);

  const orderedItems = order
    .map((k) => items.find((i) => i.key === k))
    .filter(Boolean) as MenuItem[];

  return { orderedItems, moveUp, moveDown, reset, order };
}
