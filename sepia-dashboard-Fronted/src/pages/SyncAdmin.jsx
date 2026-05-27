import { useEffect, useState, useCallback } from "react";
import { postSyncAhora, getSyncLog } from "../api";

const fDuration = (ms) => {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
};

const fDateTime = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
};

const estadoBadge = (estado) => {
  if (estado === "completado") return "live";
  if (estado === "fallido") return "error";
  return "mock";
};

export default function SyncAdmin() {
  const [log, setLog] = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const [logError, setLogError] = useState(null);
  const [sync, setSync] = useState({ loading: false, result: null, error: null });

  const loadLog = useCallback(async () => {
    setLogLoading(true);
    setLogError(null);
    try {
      const data = await getSyncLog(20);
      setLog(data.corridas || []);
    } catch (err) {
      setLogError(err.message);
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => { loadLog(); }, [loadLog]);

  const handleSync = async () => {
    setSync({ loading: true, result: null, error: null });
    try {
      const result = await postSyncAhora();
      setSync({ loading: false, result, error: null });
      loadLog();
    } catch (err) {
      setSync({ loading: false, result: null, error: err.message });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      <section className="panel">
        <div className="panel-head">
          <h2>Sincronizacion MeLi → PostgreSQL</h2>
          <span>Cron automatico: cada hora en el minuto 5</span>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.86rem", margin: "0 0 1rem" }}>
          Trae ordenes recientes desde la API de Mercado Libre y las guarda como datos
          preliminares en la base. El Excel oficial sigue siendo la fuente de verdad —
          al recargarlo, los datos preliminares se reemplazan.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSync}
            disabled={sync.loading}
          >
            {sync.loading ? "Sincronizando..." : "Sincronizar ahora"}
          </button>
          <button
            type="button"
            className="btn btn-muted"
            onClick={loadLog}
            disabled={logLoading}
          >
            Refrescar log
          </button>
        </div>

        {sync.result && (
          <div style={{
            marginTop: "1rem", padding: "10px 14px", borderRadius: "10px",
            border: "1px solid var(--line)", background: "rgba(34,197,94,0.08)",
            color: "#22c55e", fontSize: "0.86rem",
          }}>
            <strong>OK</strong> — {sync.result.mensaje}
          </div>
        )}
        {sync.error && (
          <div style={{
            marginTop: "1rem", padding: "10px 14px", borderRadius: "10px",
            border: "1px solid var(--line)", background: "rgba(248,113,113,0.08)",
            color: "#f87171", fontSize: "0.86rem",
          }}>
            <strong>Error</strong> — {sync.error}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Ultimas sincronizaciones</h2>
          {log.length > 0 && <span>{log.length} corridas</span>}
        </div>

        {logLoading && <div className="empty-state">Cargando log...</div>}
        {logError && <div className="empty-state">Error: {logError}</div>}
        {!logLoading && !logError && log.length === 0 && (
          <div className="empty-state">Sin corridas registradas.</div>
        )}

        {!logLoading && log.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Rango</th>
                  <th style={{ textAlign: "right" }}>Procesadas</th>
                  <th style={{ textAlign: "right" }}>Nuevas</th>
                  <th style={{ textAlign: "right" }}>Actualizadas</th>
                  <th style={{ textAlign: "right" }}>Errores</th>
                  <th>Duracion</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id}>
                    <td>{fDateTime(r.inicio)}</td>
                    <td style={{ color: "var(--muted)", fontSize: "0.8em" }}>
                      {r.rango_desde} → {r.rango_hasta}
                    </td>
                    <td style={{ textAlign: "right" }}>{r.ordenes_procesadas ?? "-"}</td>
                    <td style={{ textAlign: "right" }}>{r.ordenes_nuevas ?? "-"}</td>
                    <td style={{ textAlign: "right" }}>{r.ordenes_actualizadas ?? "-"}</td>
                    <td style={{
                      textAlign: "right",
                      color: r.errores > 0 ? "#f87171" : undefined,
                    }}>
                      {r.errores ?? "-"}
                    </td>
                    <td>{fDuration(r.duracion_ms)}</td>
                    <td>
                      <span className={`status-badge ${estadoBadge(r.estado)}`}>
                        {r.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
