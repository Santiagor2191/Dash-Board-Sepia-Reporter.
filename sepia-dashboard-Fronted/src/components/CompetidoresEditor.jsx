import { useEffect, useId, useState } from "react";
import { getCompetidoresSocial, createCompetidorSocial, updateCompetidorSocial } from "../api.js";

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

  const [nombreVisible, setNombreVisible] = useState("");
  const [handleInstagram, setHandleInstagram] = useState("");
  const [handleFacebook, setHandleFacebook] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [renombrandoId, setRenombrandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState("");

  const idNombre = useId();
  const idHandleIg = useId();
  const idHandleFb = useId();

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

  // Un competidor = un nombre + hasta 2 handles (IG y/o FB) que comparten
  // ese mismo nombre_visible — así el dashboard los agrupa en un solo perfil
  // con las 2 tarjetas adentro, en vez de que dependa de tipear el mismo
  // nombre "a mano" dos veces por separado (ahí es donde se desalineaban).
  const handleAgregar = async (event) => {
    event.preventDefault();
    const nombre = nombreVisible.trim();
    const ig = handleInstagram.trim();
    const fb = handleFacebook.trim();
    if (!nombre || (!ig && !fb)) return;

    setGuardando(true);
    try {
      const tareas = [];
      if (ig) tareas.push(createCompetidorSocial({ plataforma: "instagram", handle: ig, nombre_visible: nombre }));
      if (fb) tareas.push(createCompetidorSocial({ plataforma: "facebook", handle: fb, nombre_visible: nombre }));
      await Promise.all(tareas);
      setNombreVisible("");
      setHandleInstagram("");
      setHandleFacebook("");
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

  // Renombrar es la forma de "unir" 2 filas que ya existen (una de Instagram,
  // otra de Facebook) en una sola tarjeta agrupada — el agrupamiento en la
  // pestaña Competidores es por nombre_visible exacto, así que si quedaron
  // con nombres distintos, esto es lo que lo arregla sin recrear nada.
  const iniciarRenombrar = (competidor) => {
    setRenombrandoId(competidor.id);
    setNombreEditado(competidor.nombre_visible || competidor.handle);
  };

  const cancelarRenombrar = () => {
    setRenombrandoId(null);
    setNombreEditado("");
  };

  const guardarRenombrar = async (competidor) => {
    const nombre = nombreEditado.trim();
    if (!nombre) return;
    try {
      await updateCompetidorSocial(competidor.id, { nombre_visible: nombre });
      setRenombrandoId(null);
      setNombreEditado("");
      await cargarCompetidores();
    } catch (err) {
      setError(err?.message || "No se pudo renombrar el competidor.");
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
          <label htmlFor={idNombre}>Nombre del competidor</label>
          <input
            id={idNombre}
            type="text"
            className="field-input"
            placeholder="Ej: Coronas Tiaras"
            value={nombreVisible}
            onChange={(e) => setNombreVisible(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label htmlFor={idHandleIg}>Instagram</label>
          <input
            id={idHandleIg}
            type="text"
            className="field-input"
            placeholder="@usuario (opcional)"
            value={handleInstagram}
            onChange={(e) => setHandleInstagram(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label htmlFor={idHandleFb}>Facebook</label>
          <input
            id={idHandleFb}
            type="text"
            className="field-input"
            placeholder="usuario de la Página (opcional)"
            value={handleFacebook}
            onChange={(e) => setHandleFacebook(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={guardando}>
          {guardando ? "Agregando..." : "Agregar competidor"}
        </button>
      </form>

      <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: -6, marginBottom: 14 }}>
        Completá al menos una red — si cargás las dos, quedan agrupadas bajo el mismo nombre en una sola tarjeta.
        El usuario de Facebook puede ser distinto al de Instagram (es el de la Página, no el del perfil personal).
      </p>

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
                  const renombrando = renombrandoId === c.id;
                  return (
                    <tr key={c.id}>
                      <td>{PLATFORM_LABEL[c.plataforma] || c.plataforma}</td>
                      <td>
                        {renombrando ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              type="text"
                              className="field-input"
                              style={{ minWidth: 140 }}
                              value={nombreEditado}
                              onChange={(e) => setNombreEditado(e.target.value)}
                              autoFocus
                            />
                            <button type="button" className="btn-xs" onClick={() => guardarRenombrar(c)}>Guardar</button>
                            <button type="button" className="btn-xs" onClick={cancelarRenombrar}>Cancelar</button>
                          </div>
                        ) : (
                          c.nombre_visible || c.handle
                        )}
                      </td>
                      <td>
                        <span className={`status-dot ${estado.clase}`} title={estado.detalle || undefined}>
                          {estado.texto}
                        </span>
                      </td>
                      <td style={{ display: "flex", gap: 6 }}>
                        {!renombrando && (
                          <button type="button" className="btn-xs" onClick={() => iniciarRenombrar(c)}>
                            Renombrar
                          </button>
                        )}
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
