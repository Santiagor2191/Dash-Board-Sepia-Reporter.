import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  getDbVentas,
  getSessionStatus,
  loginSession,
  logoutSession,
  getRentabilidadCostosMap,
} from "./api";
import MetaDateRangePicker from "./components/MetaDateRangePicker";
import {
  COMPARISON_OPTIONS, MOBILE_BREAKPOINT,
  fNumber, fDate, prettyDate, buildExtraRangePresets, DEFAULT_MAX_RANGE,
} from "./utils";
import "./App.css";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: "[]" },
  { path: "/analytics", label: "Analytics", icon: "/\\" },
  { path: "/ordenes", label: "Ordenes", icon: "OD" },
  { path: "/inventario", label: "Inventario", icon: "IN" },
  { path: "/publicidad", label: "Publicidad", icon: "AD" },
  { path: "/ventas-meta-ads", label: "Ventas Meta Ads", icon: "MA" },
  { path: "/redes", label: "Redes", icon: "IG" },
  { path: "/rentabilidad", label: "Rentabilidad", icon: "$" },
  { path: "/conversion", label: "Conversion", icon: "%" },
  { path: "/sync", label: "Sync", icon: "⟳" },
];

export default function App() {
  const location = useLocation();
  const [time, setTime] = useState("");
  const [theme, setTheme] = useState(() => (
    typeof window !== "undefined" && window.localStorage.getItem("sepia_theme") === "light"
      ? "light"
      : "dark"
  ));
  const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [auth, setAuth] = useState({
    ready: false,
    enabled: false,
    authenticated: false,
    loading: false,
    error: null,
    expiresAt: null,
  });

  const [dbOrders, setDbOrders] = useState([]);
  const [costosMap, setCostosMap] = useState({});
  const [costosTitleMap, setCostosTitleMap] = useState({});
  const [connection, setConnection] = useState({ loading: true, source: "mock", error: null });

  // Filtro global de fechas (selector estilo Meta) + granularidad de comparación
  const [appliedRange, setAppliedRange] = useState(DEFAULT_MAX_RANGE);
  const [appliedComparison, setAppliedComparison] = useState("month");

  // Clock
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("sepia_theme", theme);
  }, [theme]);

  // Responsive
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobileViewport(mobile);
      if (mobile) {
        setSidebarCollapsed(false);
      } else {
        setSidebarMobileOpen(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = sidebarMobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = prev; };
  }, [isMobileViewport, sidebarMobileOpen]);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      try {
        const payload = await getSessionStatus();
        if (cancelled) return;
        setAuth({
          ready: true,
          enabled: payload?.authEnabled !== false,
          authenticated: Boolean(payload?.authenticated),
          loading: false,
          error: null,
          expiresAt: payload?.expiresAt || null,
        });
      } catch (error) {
        if (cancelled) return;
        setAuth({
          ready: true,
          enabled: true,
          authenticated: false,
          loading: false,
          error: error?.message || "No se pudo validar la sesión local.",
          expiresAt: null,
        });
      }
    };

    const handleExpired = () => {
      if (cancelled) return;
      setAuth((prev) => ({
        ...prev,
        ready: true,
        enabled: true,
        authenticated: false,
        loading: false,
        expiresAt: null,
        error: "Tu sesión expiró. Ingresa de nuevo.",
      }));
      setDbOrders([]);
    };

    syncSession();
    window.addEventListener("sepia-auth-expired", handleExpired);
    return () => {
      cancelled = true;
      window.removeEventListener("sepia-auth-expired", handleExpired);
    };
  }, []);

  // Load MySQL data
  useEffect(() => {
    if (!auth.ready || !auth.authenticated) {
      setDbOrders([]);
      setConnection({ loading: false, source: "mock", error: null });
      return undefined;
    }

    let cancelled = false;
    const sync = async () => {
      setConnection({ loading: true, source: "mock", error: null });
      try {
        const [payload, costosPayload] = await Promise.all([
          getDbVentas(),
          getRentabilidadCostosMap().catch(() => ({ costos: {} })),
        ]);
        if (cancelled) return;
        if (costosPayload?.costos) setCostosMap(costosPayload.costos);
        if (costosPayload?.costosPorTitulo) setCostosTitleMap(costosPayload.costosPorTitulo);
        if (payload?.results?.length) {
          setDbOrders(payload.results);
          setConnection({ loading: false, source: "mysql", error: null });
          return;
        }
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401) return;
        setConnection({
          loading: false,
          source: "mock",
          error: error?.message || "No se pudo cargar la base histórica.",
        });
        return;
      }
      if (!cancelled) setConnection({ loading: false, source: "mock", error: null });
    };
    sync();
    return () => { cancelled = true; };
  }, [auth.ready, auth.authenticated]);

  const ordersSource = dbOrders;

  const filteredAll = useMemo(() => {
    const from = new Date(appliedRange.since + "T00:00:00");
    const to = new Date(appliedRange.until + "T23:59:59");
    return ordersSource.filter((o) => {
      const d = new Date(o.date);
      return d >= from && d <= to;
    });
  }, [ordersSource, appliedRange.since, appliedRange.until]);

  const liveRangeSummary = useMemo(() => {
    if (!ordersSource.length) return null;
    const dates = ordersSource.map((o) => new Date(o.date)).sort((a, b) => a - b);
    return `${fDate(dates[0])} a ${fDate(dates[dates.length - 1])}`;
  }, [ordersSource]);

  const sortedOrders = useMemo(() => [...filteredAll].sort((a, b) => new Date(b.date) - new Date(a.date)), [filteredAll]);
  const periodSummary = useMemo(() => {
    if (!sortedOrders.length) return "Sin datos para el periodo actual";
    const first = new Date(sortedOrders[sortedOrders.length - 1].date);
    const last = new Date(sortedOrders[0].date);
    const comp = COMPARISON_OPTIONS.find((o) => o.id === appliedComparison)?.label;
    return `${fDate(first)} al ${fDate(last)} · ${comp}`;
  }, [sortedOrders, appliedComparison]);

  const applyRange = (r) => {
    setAppliedRange(r);
    if (isMobileViewport) setSidebarMobileOpen(false);
  };

  const resetFilters = () => {
    setAppliedRange(DEFAULT_MAX_RANGE());
    setAppliedComparison("month");
  };

  const dataMode = connection.loading ? "Sincronizando"
    : connection.source === "mysql" ? "POSTGRESQL HISTORICO"
    : "DEMO";

  const toggleSidebar = () => {
    if (isMobileViewport) { setSidebarMobileOpen((p) => !p); return; }
    setSidebarCollapsed((p) => !p);
  };

  const currentLabel = NAV_ITEMS.find((n) => n.path === location.pathname)?.label || "Dashboard";

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuth((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const payload = await loginSession(loginPassword);
      setLoginPassword("");
      setAuth({
        ready: true,
        enabled: payload?.authEnabled !== false,
        authenticated: true,
        loading: false,
        error: null,
        expiresAt: payload?.expiresAt || null,
      });
    } catch (error) {
      setAuth((prev) => ({
        ...prev,
        ready: true,
        enabled: true,
        authenticated: false,
        loading: false,
        error: error?.message || "No se pudo iniciar sesión.",
        expiresAt: null,
      }));
    }
  };

  const handleLogout = async () => {
    try {
      await logoutSession();
    } catch {
      // Local cleanup still happens client-side when the token is invalid or expired.
    }
    setDbOrders([]);
    setConnection({ loading: false, source: "mock", error: null });
    setAuth((prev) => ({
      ...prev,
      ready: true,
      authenticated: false,
      loading: false,
      error: null,
      expiresAt: null,
    }));
  };

  if (!auth.ready) {
    return (
      <div className="auth-shell">
        <section className="panel auth-panel">
          <div className="auth-title">Validando sesión local...</div>
          <p className="auth-subtitle">Estamos comprobando el acceso al dashboard.</p>
        </section>
      </div>
    );
  }

  if (auth.enabled && !auth.authenticated) {
    return (
      <div className="auth-shell">
        <section className="panel auth-panel">
          <div className="auth-brand">
            <div className="brand-icon">S</div>
            <div>
              <div className="brand-title">Sepia</div>
              <div className="brand-subtitle">Acceso local protegido</div>
            </div>
          </div>
          <div className="auth-title">Ingresa tu clave de administrador</div>
          <p className="auth-subtitle">
            El backend requiere una sesión local antes de consultar Mercado Libre y MySQL.
          </p>
          <form className="auth-form" onSubmit={handleLogin}>
            <input
              type="password"
              className="dropdown-search"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Clave del dashboard"
              autoComplete="current-password"
            />
            {auth.error && <div className="auth-error">{auth.error}</div>}
            <button type="submit" className="btn btn-primary" disabled={auth.loading || !loginPassword.trim()}>
              {auth.loading ? "Ingresando..." : "Entrar al dashboard"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className={`app-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarMobileOpen ? "is-mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">S</div>
          <div>
            <div className="brand-title">Sepia</div>
            <div className="brand-subtitle">Moda y Mas</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              onClick={() => setSidebarMobileOpen(false)}
            >
              <span>{item.icon}</span><span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-filters">
          <div className="sidebar-section-title">Filtro activo</div>
          <div className="sidebar-chip-row">
            <span className="chip">{appliedRange.label}: {prettyDate(appliedRange.since)} → {prettyDate(appliedRange.until)}</span>
            <span className="chip">{COMPARISON_OPTIONS.find((o) => o.id === appliedComparison)?.label}</span>
          </div>
        </div>
        <div className="sidebar-footer">
          <button type="button" className="btn btn-muted" onClick={resetFilters}>Reset</button>
        </div>
      </aside>

      <button type="button" className={`mobile-overlay ${sidebarMobileOpen ? "is-active" : ""}`} aria-label="Cerrar menu lateral" onClick={() => setSidebarMobileOpen(false)} />

      <main className="main-wrap">
        <header className="topbar">
          <div className="topbar-row">
            <div className="topbar-left">
              <button type="button" className="icon-btn" aria-label={sidebarMobileOpen ? "Cerrar menu" : "Abrir menu"} aria-expanded={isMobileViewport ? sidebarMobileOpen : !sidebarCollapsed} onClick={toggleSidebar}>&#9776;</button>
              <div className="topbar-title-wrap">
                <h1>{currentLabel}</h1>
                <p>{periodSummary}</p>
              </div>
            </div>
            <div className="topbar-right">
              <MetaDateRangePicker
                range={appliedRange}
                onApply={applyRange}
                extraPresets={buildExtraRangePresets()}
              />
              <div className="comparison-group">
                {COMPARISON_OPTIONS.map((opt) => (
                  <button key={opt.id} type="button" className={`comparison-btn ${appliedComparison === opt.id ? "active" : ""}`} onClick={() => setAppliedComparison(opt.id)}>{opt.label}</button>
                ))}
              </div>
              <button type="button" className="btn btn-theme" onClick={() => setTheme((p) => p === "dark" ? "light" : "dark")}>{theme === "dark" ? "Oscuro" : "Claro"}</button>
              {auth.enabled && <button type="button" className="btn btn-muted" onClick={handleLogout}>Salir</button>}
            </div>
          </div>
          <div className="status-row">
            <span className={`status-badge ${connection.source === "mysql" ? "live" : "mock"}`}>{dataMode}</span>
            {connection.source === "mysql" && liveRangeSummary && <span className="status-badge">Rango: {liveRangeSummary}</span>}
            <span className="status-badge">Ordenes: {fNumber(filteredAll.length)}</span>
            {connection.error && <span className="status-badge error">Error: {connection.error}</span>}
          </div>
        </header>

        <div className="content">
          <Outlet context={{ filteredAll, ordersSource, appliedComparison, time, connection, costosMap, costosTitleMap }} />
        </div>
      </main>
    </div>
  );
}
