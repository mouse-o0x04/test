import { Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import NocodbLayout from "./components/NocodbLayout";
import LoginPage from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ClientsPage from "./pages/Clients";
import ProductsPage from "./pages/Products";
import OrdersPage from "./pages/Orders";
import WarehousePage from "./pages/Warehouse";
import RawMaterialsPage from "./pages/RawMaterials";
import SettingsPage from "./pages/Settings";
import CalculatorPage from "./pages/Calculator";
import ArchivePage from "./pages/Archive";
import KnowledgePage from "./pages/Knowledge";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.is_superuser) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { token } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <NocodbLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/clients" element={<ClientsPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/warehouse" element={<WarehousePage />} />
                <Route path="/raw-materials" element={<RawMaterialsPage />} />
                <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
                <Route path="/calculator" element={<CalculatorPage />} />
                <Route path="/archive" element={<ArchivePage />} />
                <Route path="/knowledge" element={<KnowledgePage />} />
              </Routes>
            </NocodbLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
