import { useEffect, useId, useState } from "react";
import { getCompetidoresSocial, createCompetidorSocial, updateCompetidorSocial } from "../api.js";

const PLATAFORMAS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
];

const PLATFORM_LABEL = { instagram: "Instagram", facebook: "Facebook" };

const estadoDe = (c) => {
  if (c.last_error) return { texto: "Sin datos recientes", clase: "warn", detalle: c.last_error };
  if (c.last_synced_at) return { texto: "Sincronizado", clase: "ok", detalle: null };
  return { texto: "Pendiente de primer sync", clase: "pending", detalle: null };
};

export default function CompetidoresEditor() {
  const [competidores, setCompetidores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [plataforma, setPlataforma] = useState("instagram");
  const [handle, setHandle] = useState("");
  const [nombreVisible, setNombreVisible] = useState("");
  const [guardando, setGuardando] = useState(false);

  const idPlataforma = useId();
  const idHandle = useId();
  const idNombre = useId();

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
        <h2>Gestionar competidores</h2>
        <span>Se sincroniza una vez al día — el primer perfil puede tardar hasta la próxima corrida</span>
      </div>

      <form onSubmit={handleAgregar} className="competidor-form">
        <div className="field-group">
          <label htmlFor={idPlataforma}>Plataforma</label>
          <select
            id={idPlataforma}
            className="field-input"
            value={plataforma}
            onChange={(e) => setPlataforma(e.target.value)}
          >
            {PLATAFORMAS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor={idHandle}>Usuario / handle</label>
          <input
            id={idHandle}
            type="text"
            className="field-input"
            placeholder="@handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label htmlFor={idNombre}>Nombre visible</label>
          <input
            id={idNombre}
            type="text"
            className="field-input"
            placeholder="Opcional"
            value={nombreVisible}
            onChange={(e) => setNombreVisible(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={guardando}>
          {guardando ? "Agregando..." : "Agregar competidor"}
        </button>
      </form>

      {error && <div className="empty-state" role="alert">{error}</div>}

      {!cargando && competidores.length === 0 && !error && (
        <div className="empty-state">
          Todavía no cargaste competidores. Completá el formulario de arriba con el @usuario de alguien que quieras
          seguir de cerca — Instagram trae seguidores, cadencia y engagement; Facebook solo seguidores.
        </div>
      )}

      {competidores.length > 0 && (
        <>
          <div className="competidores-list-head">
            <h4>{competidores.length} {competidores.length === 1 ? "competidor cargado" : "competidores cargados"}</h4>
          </div>
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
                {competidores.map((c) => {
                  const estado = estadoDe(c);
                  return (
                    <tr key={c.id}>
                      <td>{PLATFORM_LABEL[c.plataforma] || c.plataforma}</td>
                      <td>{c.nombre_visible || c.handle}</td>
                      <td>
                        <span className={`status-dot ${estado.clase}`} title={estado.detalle || undefined}>
                          {estado.texto}
                        </span>
                      </td>
                      <td>
                        <button type="button" className="btn-xs" onClick={() => handleToggleActivo(c)}>
                          {c.activo ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
