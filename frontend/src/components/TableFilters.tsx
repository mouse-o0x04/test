import { DatePicker, Input, Space } from "antd";
import type { ColumnType } from "antd/es/table";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

export function textFilter<T>(dataIndex: keyof T & string, placeholder?: string, onApply?: (value: string[]) => void): ColumnType<T> {
  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <Space style={{ padding: 8 }}>
        <Input
          placeholder={placeholder || "Поиск..."}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => { onApply?.(selectedKeys as string[]); confirm(); }}
          style={{ width: 188 }}
        />
        <Space>
          <button
            onClick={() => { onApply?.(selectedKeys as string[]); confirm(); }}
            style={{ background: "#1677ff", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
          >
            OK
          </button>
          <button
            onClick={() => { onApply?.([]); clearFilters?.(); confirm(); }}
            style={{ border: "1px solid #d9d9d9", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
          >
            Сброс
          </button>
        </Space>
      </Space>
    ),
    onFilter: (value, record) => {
      const val = (record as Record<string, unknown>)[dataIndex];
      return val
        ? String(val).toLowerCase().includes(String(value).toLowerCase())
        : false;
    },
  };
}

export function numberFilter<T>(
  dataIndex: keyof T & string,
  options?: { min?: number; max?: number; onApply?: (value: string[]) => void }
): ColumnType<T> {
  const onApply = options?.onApply;
  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <Space style={{ padding: 8 }} direction="vertical">
        <Space>
          <Input
            placeholder="от"
            type="number"
            value={selectedKeys[0] ? String(selectedKeys[0]).split(",")[0] : ""}
            onChange={(e) => {
              const max = selectedKeys[0] ? String(selectedKeys[0]).split(",")[1] || "" : "";
              setSelectedKeys(e.target.value || max ? [`${e.target.value},${max}`] : []);
            }}
            style={{ width: 90 }}
          />
          <Input
            placeholder="до"
            type="number"
            value={selectedKeys[0] ? String(selectedKeys[0]).split(",")[1] || "" : ""}
            onChange={(e) => {
              const min = selectedKeys[0] ? String(selectedKeys[0]).split(",")[0] || "" : "";
              setSelectedKeys(min || e.target.value ? [`${min},${e.target.value}`] : []);
            }}
            style={{ width: 90 }}
          />
        </Space>
        <Space>
          <button
            onClick={() => { onApply?.(selectedKeys as string[]); confirm(); }}
            style={{ background: "#1677ff", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
          >
            OK
          </button>
          <button
            onClick={() => { onApply?.([]); clearFilters?.(); confirm(); }}
            style={{ border: "1px solid #d9d9d9", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
          >
            Сброс
          </button>
        </Space>
      </Space>
    ),
    onFilter: (value, record) => {
      const str = String(value);
      const [minStr, maxStr] = str.split(",");
      const val = (record as Record<string, unknown>)[dataIndex];
      const num = typeof val === "number" ? val : parseFloat(String(val || 0));
      if (minStr && num < Number(minStr)) return false;
      if (maxStr && num > Number(maxStr)) return false;
      return true;
    },
  };
}

export function selectFilter<T>(dataIndex: keyof T & string, options: { text: string; value: string | number | boolean }[]): ColumnType<T> {
  return {
    filters: options.map((o) => ({ text: o.text, value: o.value })),
    onFilter: (value, record) => {
      const val = (record as Record<string, unknown>)[dataIndex];
      return val === value;
    },
  };
}

export function dateRangeFilter<T>(dataIndex: keyof T & string, onApply?: (value: string[]) => void): ColumnType<T> {
  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => {
      const str = selectedKeys[0] as string | undefined;
      const parts = str ? str.split(",") : [];
      const from = parts[0] ? dayjs(parts[0]) : null;
      const to = parts[1] ? dayjs(parts[1]) : null;
      return (
        <div style={{ padding: 8 }}>
          <RangePicker
            value={from && to ? [from, to] : null}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setSelectedKeys([`${dates[0].format("YYYY-MM-DD")},${dates[1].format("YYYY-MM-DD")}`]);
              } else {
                setSelectedKeys([]);
              }
            }}
            style={{ marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => { onApply?.(selectedKeys as string[]); confirm(); }}
              style={{ background: "#1677ff", color: "#fff", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
            >
              OK
            </button>
            <button
              onClick={() => { onApply?.([]); clearFilters?.(); confirm(); }}
              style={{ border: "1px solid #d9d9d9", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
            >
              Сброс
            </button>
          </div>
        </div>
      );
    },
    onFilter: (value, record) => {
      const str = String(value);
      const [fromStr, toStr] = str.split(",");
      const val = (record as Record<string, unknown>)[dataIndex];
      if (!val) return false;
      const date = dayjs(val as string);
      if (!date.isValid()) return false;
      if (fromStr && date.isBefore(dayjs(fromStr).startOf("day"))) return false;
      if (toStr && date.isAfter(dayjs(toStr).endOf("day"))) return false;
      return true;
    },
  };
}
