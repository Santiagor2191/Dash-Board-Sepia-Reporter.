import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Analytics = lazy(() => import("./pages/Analytics.jsx"));
const Publicidad = lazy(() => import("./pages/Publicidad.jsx"));
const Ordenes = lazy(() => import("./pages/Ordenes.jsx"));
const Inventario = lazy(() => import("./pages/Inventario.jsx"));
const Rentabilidad = lazy(() => import("./pages/Rentabilidad.jsx"));
const Conversion = lazy(() => import("./pages/Conversion.jsx"));
const SeoTitulos = lazy(() => import("./pages/SeoTitulos.jsx"));
const SeoTitulosNuevos = lazy(() => import("./pages/SeoTitulosNuevos.jsx"));
const VentasMetaAds = lazy(() => import("./pages/VentasMetaAds.jsx"));
const Redes = lazy(() => import("./pages/Redes.jsx"));
const SyncAdmin = lazy(() => import("./pages/SyncAdmin.jsx"));
const Crm = lazy(() => import("./pages/Crm.jsx"));

const renderPage = (Component) => (
  <Suspense fallback={<div className="empty-state">Cargando modulo...</div>}>
    <Component />
  </Suspense>
);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={renderPage(Dashboard)} />
          <Route path="analytics" element={renderPage(Analytics)} />
          <Route path="publicidad" element={renderPage(Publicidad)} />
          <Route path="ordenes" element={renderPage(Ordenes)} />
          <Route path="inventario" element={renderPage(Inventario)} />
          <Route path="rentabilidad" element={renderPage(Rentabilidad)} />
          <Route path="conversion" element={renderPage(Conversion)} />
          <Route path="seo-titulos" element={<Navigate to="/seo-titulos/publicaciones" replace />} />
          <Route path="seo-titulos/publicaciones" element={renderPage(SeoTitulos)} />
          <Route path="seo-titulos/nuevas" element={renderPage(SeoTitulosNuevos)} />
          <Route path="ventas-meta-ads" element={renderPage(VentasMetaAds)} />
          <Route path="redes" element={renderPage(Redes)} />
          <Route path="crm" element={renderPage(Crm)} />
          <Route path="crm/:section" element={renderPage(Crm)} />
          <Route path="sync" element={renderPage(SyncAdmin)} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
