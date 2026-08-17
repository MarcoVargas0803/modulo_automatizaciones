import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Login } from '@/modules/auth/pages/Login/Login';
import { DashboardLayout } from '@/shared/layouts/DashboardLayout/DashboardLayout';
import { ProtectedRoute } from '@/shared/components/ProtectedRoute/ProtectedRoute';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary/ErrorBoundary';
import { AuthProvider } from '@/shared/context/AuthContext';
import { ToastProvider } from '@/shared/components/Toast/Toast';
import { SkeletonProvider } from '@/shared/components/Skeleton/Skeleton';
import { PageSkeleton } from '@/shared/components/Skeleton/PageSkeleton';

const Dashboard = lazy(() => import('@/modules/executions/pages/Dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const Logs = lazy(() => import('@/modules/executions/pages/Logs/Logs').then((m) => ({ default: m.Logs })));
const LogDetail = lazy(() => import('@/modules/executions/pages/LogDetail/LogDetail').then((m) => ({ default: m.LogDetail })));
const InternationalPurchases = lazy(() => import('@/modules/international-purchases/pages/InternationalPurchases/InternationalPurchases').then((m) => ({ default: m.InternationalPurchases })));
const ShipmentInvites = lazy(() => import('@/modules/international-purchases/pages/ShipmentInvites/ShipmentInvites').then((m) => ({ default: m.ShipmentInvites })));
const MaterialRevaluations = lazy(() => import('@/modules/material-revaluations/pages/MaterialRevaluations/MaterialRevaluations').then((m) => ({ default: m.MaterialRevaluations })));
const ShipmentRegistration = lazy(() => import('@/modules/international-purchases/pages/ShipmentRegistration/ShipmentRegistration').then((m) => ({ default: m.ShipmentRegistration })));
const Administration = lazy(() => import('@/modules/admin/pages/Administration/Administration').then((m) => ({ default: m.Administration })));
const ProcessAudit = lazy(() => import('@/modules/executions/pages/ProcessAudit/ProcessAudit').then((m) => ({ default: m.ProcessAudit })));

// Silueta de la pantalla mientras se descarga su chunk. Antes era el texto
// "Cargando…", que encogia el contenido a tres lineas y devolvia el alto de
// golpe al resolver: ese colapso es lo que se percibia como salto.
//
// `fade-in-delayed` la mantiene invisible los primeros 120 ms, asi que un chunk
// ya cacheado no llega a mostrarla. PageSkeleton reproduce la forma de un
// listado —cabecera, filtros y tabla—, que es la de casi todas las rutas; en
// Dashboard y LogDetail es solo aproximada.
function PageFallback() {
  return (
    <div className="fade-in-delayed">
      <PageSkeleton />
    </div>
  );
}

// Ruta de layout: se monta en el Outlet de DashboardLayout, asi que un error de
// render deja la barra lateral en pie y solo reemplaza el contenido. El key por
// ruta remonta el boundary al navegar; sin el, una pantalla rota deja atrapado
// al usuario en el error aunque cambie de seccion.
function RouteBoundary() {
  const { pathname } = useLocation();

  // El `key` por ruta remonta el envoltorio en cada navegacion, que es lo que
  // dispara de nuevo la animacion de entrada: sin el, el <div> persistiria y el
  // contenido nuevo aparecería sin fundido.
  return (
    <ErrorBoundary key={pathname}>
      <div className="fade-in" key={pathname}>
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}

// El boundary raiz es la red de ultimo recurso: cubre lo que el de ruta no
// alcanza -Login, la ruta *, ProtectedRoute, DashboardLayout y los tres
// providers-, que hasta ahora dejaban pantalla en blanco. Va por fuera del
// Router porque su fallback solo usa Alert y Button, sin context ni <Link>.
// A cambio no puede resetearse por navegacion: su unica salida es recargar.
function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <SkeletonProvider>
        <ToastProvider>
        <AuthProvider>
          <Routes>
        <Route path="/" element={<Login />} />

        {/* Registro de embarques por forwarder. Va FUERA de ProtectedRoute a
            proposito: quien la abre no tiene cuenta en el sistema. Su
            credencial es el token del enlace, que la pagina lee del fragmento
            de la URL. */}
        <Route
          path="/compras/registro-embarque"
          element={
            <ErrorBoundary>
              <Suspense fallback={<PageFallback />}>
                <ShipmentRegistration />
              </Suspense>
            </ErrorBoundary>
          }
        />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route element={<RouteBoundary />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/revaluaciones" element={<MaterialRevaluations />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/logs/:id" element={<LogDetail />} />
              <Route path="/international-purchases" element={<InternationalPurchases />} />
              <Route path="/international-purchases/enlaces" element={<ShipmentInvites />} />
              <Route path="/administracion" element={<Administration />} />
              <Route path="/administracion/:tab" element={<Administration />} />
              <Route path="/auditoria/:processCode" element={<ProcessAudit />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
        </ToastProvider>
      </SkeletonProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
