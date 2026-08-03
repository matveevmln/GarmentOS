import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./layout/AppLayout";
import { IconSpriteDefs } from "./design-system/Icons/Icon";
import { Toaster } from "./design-system/Toast/Toast";
import { WorkshopsPage } from "./pages/WorkshopsPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { WarehousesPage } from "./pages/WarehousesPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { ProductionOrdersPage } from "./pages/ProductionOrdersPage";
import { DesignSystemPage } from "./pages/DesignSystemPage";

export function App() {
  return (
    <AuthProvider>
      <IconSpriteDefs />
      <Toaster />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/design-system" element={<DesignSystemPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/workshops" replace />} />
            <Route path="/workshops" element={<WorkshopsPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/materials" element={<MaterialsPage />} />
            <Route path="/warehouses" element={<WarehousesPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
            <Route path="/production-orders" element={<ProductionOrdersPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
