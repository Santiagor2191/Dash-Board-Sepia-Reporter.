import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  getDbVentas,
  getSessionStatus,
  loginSession,
  logoutSession,
  getRentabilidadCostosMap,
} from "./api";
import MultiSelectDropdown from "./components/MultiSelectDropdown";
import {
  MONTHS, COMPARISON_OPTIONS, ALL_MONTH_VALUES, MOBILE_BREAKPOINT,
  fNumber, fDate,
} from "./utils";
import "./App.css";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: "[]" },
  { path: "/analytics", label: "Analytics", icon: "/\\" },
  { path: "/ordenes", label: "Ordenes", icon: "OD" },
  { path: "/inventario", label: "Inventario", icon: "IN" },
  { path: "/publicidad", label: "Publicidad", icon: "AD" },
  { path: "/ventas-meta-ads", label: "Ventas Meta Ads", icon: "MA" },
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
  const [openDropdown, setOpenDropdown] = useState(null);
  const [yearSearch, setYearSearch] = useState("");
  const [monthSearch, setMonthSearch] = useState("");
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
  const [connection, setConnection] = useState({ loading: true, source: "mock", error: null });

  const [draftYears, setDraftYears] = useState([]);
  const [draftMonths, setDraftMonths] = useState(ALL_MONTH_VALUES);
  const [draftComparison, setDraftComparison] = useState("month");
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [filterMode, setFilterMode] = useState("period");
  const [appliedYears, setAppliedYears] = useState([]);
  const [appliedMonths, setAppliedMonths] = useState(ALL_MONTH_VALUES);
  const [appliedComparison, setAppliedComparison] = useState("month");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");
  const [appliedFilterMode, setAppliedFilterMode] = useState("period");

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

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => { if (!e.target.closest("[data-dropdown-root]")) setOpenDropdown(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  const allYears = useMemo(() => {
    const years = new Set();
    ordersSource.forEach((o) => years.add(new Date(o.date).getFullYear()));
    return [...years].sort((a, b) => b - a);
  }, [ordersSource]);

  useEffect(() => {
    if (!allYears.length) return;
    setDraftYears((prev) => prev.length ? prev.filter((y) => allYears.includes(y)) : allYears);
    setAppliedYears((prev) => prev.length ? prev.filter((y) => allYears.includes(y)) : allYears);
  }, [allYears]);

  useEffect(() => {
    if (allYears.length && !appliedYears.length) setAppliedYears(allYears);
  }, [allYears, appliedYears.length]);

  const filteredAll = useMemo(() => {
    if (appliedFilterMode === "range") {
      const from = appliedDateFrom ? new Date(appliedDateFrom + "T00:00:00") : null;
      const to = appliedDateTo ? new Date(appliedDateTo + "T23:59:59") : null;
      return ordersSource.filter((o) => {
        const d = new Date(o.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    const years = new Set(appliedYears.length ? appliedYears : allYears);
    const months = new Set(appliedMonths.length ? appliedMonths : ALL_MONTH_VALUES);
    return ordersSource.filter((o) => {
      const d = new Date(o.date);
      return years.has(d.getFullYear()) && months.has(d.getMonth() + 1);
    });
  }, [ordersSource, appliedFilterMode, appliedYears, appliedMonths, appliedDateFrom, appliedDateTo, allYears]);

  const paidOrders = useMemo(() => filteredAll.filter((o) => o.status === "paid"), [filteredAll]);

  const buyers = useMemo(() => {
    const map = {};
    paidOrders.forEach((o) => { const k = String(o.buyer); map[k] = (map[k] || 0) + 1; });
    return { unique: Object.keys(map).length, repeat: Object.values(map).filter((v) => v >= 2).length };
  }, [paidOrders]);

  const recurrence = buyers.unique ? (buyers.repeat / buyers.unique) * 100 : 0;

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

  const toggleMulti = (value, setter) => {
    setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  };

  const applyFilters = () => {
    setAppliedFilterMode(filterMode);
    setAppliedComparison(draftComparison);
    if (filterMode === "range") {
      setAppliedDateFrom(draftDateFrom);
      setAppliedDateTo(draftDateTo);
    } else {
      const nextYears = draftYears.length ? [...draftYears] : allYears;
      const nextMonths = draftMonths.length ? [...draftMonths] : ALL_MONTH_VALUES;
      setDraftYears(nextYears);
      setDraftMonths(nextMonths);
      setAppliedYears(nextYears);
      setAppliedMonths(nextMonths);
    }
    setOpenDropdown(null);
    if (isMobileViewport) setSidebarMobileOpen(false);
  };

  const resetFilters = () => {
    setFilterMode("period");
    setDraftDateFrom("");
    setDraftDateTo("");
    setAppliedFilterMode("period");
    setAppliedDateFrom("");
    setAppliedDateTo("");
    setDraftYears(allYears);
    setDraftMonths(ALL_MONTH_VALUES);
    setDraftComparison("month");
    setAppliedYears(allYears);
    setAppliedMonths(ALL_MONTH_VALUES);
    setAppliedComparison("month");
    setYearSearch("");
    setMonthSearch("");
    setOpenDropdown(null);
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
              onClick={() => { setSidebarMobileOpen(false); setOpenDropdown(null); }}
            >
              <span>{item.icon}</span><span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-filters">
          <div className="sidebar-section-title">Filtros</div>
          <div className="comparison-group sidebar-full-width">
            <button type="button" className={`comparison-btn ${filterMode === "period" ? "active" : ""}`} onClick={() => setFilterMode("period")}>Año/Mes</button>
            <button type="button" className={`comparison-btn ${filterMode === "range" ? "active" : ""}`} onClick={() => setFilterMode("range")}>Rango libre</button>
          </div>
          {filterMode === "period" ? (
            <div className="sidebar-filter-controls">
              <MultiSelectDropdown title="Anio" options={allYears.map((y) => ({ value: y, label: String(y) }))} open={openDropdown === "year"} onToggle={() => setOpenDropdown((p) => p === "year" ? null : "year")} selectedValues={draftYears} searchValue={yearSearch} onSearchChange={setYearSearch} onToggleValue={(v) => toggleMulti(v, setDraftYears)} onSelectAll={() => setDraftYears(allYears)} onClear={() => setDraftYears([])} />
              <MultiSelectDropdown title="Mes" options={MONTHS} open={openDropdown === "month"} onToggle={() => setOpenDropdown((p) => p === "month" ? null : "month")} selectedValues={draftMonths} searchValue={monthSearch} onSearchChange={setMonthSearch} onToggleValue={(v) => toggleMulti(v, setDraftMonths)} onSelectAll={() => setDraftMonths(ALL_MONTH_VALUES)} onClear={() => setDraftMonths([])} />
            </div>
          ) : (
            <div className="date-range-sidebar">
              <input type="date" className="date-input sidebar-full-width" value={draftDateFrom} onChange={(e) => setDraftDateFrom(e.target.value)} />
              <span className="date-sep">→</span>
              <input type="date" className="date-input sidebar-full-width" value={draftDateTo} onChange={(e) => setDraftDateTo(e.target.value)} />
            </div>
          )}
          <div className="comparison-group sidebar-full-width">
            {COMPARISON_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" className={`comparison-btn ${draftComparison === opt.id ? "active" : ""}`} onClick={() => setDraftComparison(opt.id)}>{opt.label}</button>
            ))}
          </div>
        </div>
        <div className="sidebar-footer">
          <button type="button" className="btn btn-primary" onClick={applyFilters}>Aplicar</button>
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
          <Outlet context={{ filteredAll, ordersSource, appliedComparison, time, connection, costosMap }} />
        </div>
      </main>
    </div>
  );
}
