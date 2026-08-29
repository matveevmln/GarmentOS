import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./layout/AppShell";
import { IconSpriteDefs } from "./design-system/Icons/Icon";
import { Toaster } from "./design-system/Toast/Toast";
import { TooltipProvider } from "./design-system/Tooltip/Tooltip";
import { CommandPalette } from "./design-system/CommandPalette/CommandPalette";
import { DashboardPage } from "./pages/DashboardPage";
import { WorkshopsPage } from "./pages/WorkshopsPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { WarehousesPage } from "./pages/WarehousesPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { ProductionOrdersPage } from "./pages/ProductionOrdersPage";
import { BatchPassportPage } from "./pages/BatchPassportPage";
import { PilotDashboardPage } from "./pages/PilotDashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { DesignSystemPage } from "./pages/DesignSystemPage";

export function App() {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={300}>
        <IconSpriteDefs />
        <Toaster />
        <CommandPalette />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/design-system" element={<DesignSystemPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/workshops" element={<WorkshopsPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/warehouses" element={<WarehousesPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
              <Route path="/production-orders" element={<ProductionOrdersPage />} />
              <Route path="/production-orders/:id" element={<BatchPassportPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/pilot" element={<PilotDashboardPage />} />
            </Route>
          </Route>
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  );
}
