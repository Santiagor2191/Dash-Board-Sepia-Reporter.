import { useEffect, useState } from "react";
import { getCompetidoresSocial, createCompetidorSocial, updateCompetidorSocial } from "../api.js";

const PLATAFORMAS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
];

export default function CompetidoresEditor() {
  const [competidores, setCompetidores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [plataforma, setPlataforma] = useState("instagram");
  const [handle, setHandle] = useState("");
  const [nombreVisible, setNombreVisible] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargarCompetidores = async () => {
    setCargando(true);
    try {
      const payload = await getCompetidoresSocial();
      setCompetidores(payload.competidores || []);
      setError(null);
    } catch (err) {
      setError(err?.message || "No se pudieron cargar los competidores.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarCompetidores();
  }, []);

  const handleAgregar = async (event) => {
    event.preventDefault();
    if (!handle.trim()) return;

    setGuardando(true);
    try {
      await createCompetidorSocial({ plataforma, handle, nombre_visible: nombreVisible });
      setHandle("");
      setNombreVisible("");
      setError(null);
      await cargarCompetidores();
    } catch (err) {
      // No se pierde lo tipeado: solo mostramos el error, no reseteamos el form.
      setError(err?.message || "No se pudo guardar el competidor.");
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleActivo = async (competidor) => {
    try {
      await updateCompetidorSocial(competidor.id, { activo: !competidor.activo });
      await cargarCompetidores();
    } catch (err) {
      setError(err?.message || "No se pudo actualizar el competidor.");
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Competidores</h2>
        <span>Instagram completo · Facebook solo seguidores</span>
      </div>

      <form onSubmit={handleAgregar} style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>
          {PLATAFORMAS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="@handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          aria-label="handle"
        />
        <input
          type="text"
          placeholder="Nombre visible (opcional)"
          value={nombreVisible}
          onChange={(e) => setNombreVisible(e.target.value)}
          aria-label="nombre visible"
        />
        <button type="submit" className="btn-xs" disabled={guardando}>
          {guardando ? "Agregando..." : "Agregar competidor"}
        </button>
      </form>

      {error && <div className="empty-state" role="alert">{error}</div>}

      {!cargando && competidores.length === 0 && !error && (
        <div className="empty-state">
          Todavía no cargaste competidores. Agregá uno arriba para empezar a compararte.
        </div>
      )}

      {competidores.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plataforma</th>
                <th>Handle</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {competidores.map((c) => (
                <tr key={c.id}>
                  <td>{c.plataforma}</td>
                  <td>{c.nombre_visible || c.handle}</td>
                  <td>
                    {c.last_error
                      ? <span title={c.last_error}>Sin datos recientes</span>
                      : c.last_synced_at
                        ? "Sincronizado"
                        : "Pendiente de primer sync"}
                  </td>
                  <td>
                    <button type="button" className="btn-xs" onClick={() => handleToggleActivo(c)}>
                      {c.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
