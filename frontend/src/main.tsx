import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import type { ThemeConfig } from "antd";
import ruRU from "antd/locale/ru_RU";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import customParseFormat from "dayjs/plugin/customParseFormat";
import App from "./App";
import "./styles/nocodb.css";
import "./styles/product-form.css";

dayjs.locale("ru");
dayjs.extend(customParseFormat);

const theme: ThemeConfig = {
  token: {
    colorBgLayout: "#F7F8FA",
    borderRadius: 8,
    colorBorder: "#D9DDEB",
    colorPrimary: "#4F7CFF",
    colorPrimaryHover: "#3B68E6",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  components: {
    Modal: {
      borderRadiusLG: 16,
    },
    Card: {
      borderRadius: 12,
      colorBorder: "#E7EBF3",
    },
    Input: {
      borderRadius: 10,
      controlHeight: 44,
    },
    InputNumber: {
      borderRadius: 10,
      controlHeight: 44,
    },
    Select: {
      borderRadius: 10,
      controlHeight: 44,
    },
    Button: {
      borderRadius: 10,
      controlHeight: 44,
    },
  },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={ruRU} theme={theme}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
