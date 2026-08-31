import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import UserManual from './pages/UserManual';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminCategories from './pages/admin/AdminCategories';
import AdminPriceLists from './pages/admin/AdminPriceLists';
import AdminClients from './pages/admin/AdminClients';
import AdminBranches from './pages/admin/AdminBranches';
import AdminUsers from './pages/admin/AdminUsers';
import AdminOrders from './pages/admin/AdminOrders';
import AdminOrderDetail from './pages/admin/AdminOrderDetail';
import AdminCompanies from './pages/admin/AdminCompanies';
import AdminContracts from './pages/admin/AdminContracts';
import AdminReports from './pages/admin/AdminReports';
import ClientLayout from './pages/client/ClientLayout';
import ClientCatalog from './pages/client/ClientCatalog';
import ClientOrders from './pages/client/ClientOrders';
import ClientConfirmOrder from './pages/client/ClientConfirmOrder';
import ClientApproveOrders from './pages/client/ClientApproveOrders';
import ClientOrderDetail from './pages/client/ClientOrderDetail';
import ClientManage from './pages/client/ClientManage';
import ClientStats from './pages/client/ClientStats';
import ClientReports from './pages/client/ClientReports';
import AdvisorLayout from './pages/advisor/AdvisorLayout';
import AdvisorOrders from './pages/advisor/AdvisorOrders';
import AdvisorOrderDetail from './pages/advisor/AdvisorOrderDetail';
import AdvisorCompanies from './pages/advisor/AdvisorCompanies';
import DeliveryLayout from './pages/delivery/DeliveryLayout';
import DeliveryOrders from './pages/delivery/DeliveryOrders';
import DeliveryOrderDetail from './pages/delivery/DeliveryOrderDetail';

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/manual" element={<UserManual />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="catalogo" element={<AdminProducts />} />
            <Route path="centros-de-costos" element={<AdminCategories />} />
            <Route path="listas-precios" element={<AdminPriceLists />} />
            <Route path="pedidos/:orderId" element={<AdminOrderDetail />} />
            <Route path="empresas" element={<AdminCompanies />} />
            <Route path="contratos" element={<AdminContracts />} />
            <Route path="clientes" element={<AdminClients />} />
            <Route path="pedidos" element={<AdminOrders />} />
            <Route path="sedes" element={<AdminBranches />} />
            <Route path="asesores" element={<AdminUsers />} />
            <Route path="reportes" element={<AdminReports />} />
          </Route>
          <Route
            path="/cliente"
            element={
              <ProtectedRoute allowedRole="client">
                <ClientLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ClientCatalog />} />
            <Route path="pedidos" element={<ClientOrders />} />
            <Route path="confirmar-pedido" element={<ClientConfirmOrder />} />
            <Route path="aprobar-pedidos" element={<ClientApproveOrders />} />
            <Route path="pedidos/:orderId" element={<ClientOrderDetail />} />
            <Route path="estadisticas" element={<ClientStats />} />
            <Route path="reportes" element={<ClientReports />} />
            <Route path="administrar" element={<ClientManage />} />
          </Route>
          <Route
            path="/asesor"
            element={
              <ProtectedRoute allowedRole="advisor">
                <AdvisorLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdvisorOrders />} />
            <Route path="empresas" element={<AdvisorCompanies />} />
            <Route path="pedido/:orderId" element={<AdvisorOrderDetail />} />
          </Route>
          <Route
            path="/entregas"
            element={
              <ProtectedRoute allowedRole="delivery">
                <DeliveryLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DeliveryOrders />} />
            <Route path="pedido/:orderId" element={<DeliveryOrderDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AppProvider>
    </AuthProvider>
  );
}
