import { useEffect, useState } from "react";
import { getCategoriasTendencias, getStatus, redirectToMercadoLibreAuth } from "../api";
import TallerTitulo from "../components/TallerTitulo";

export default function SeoTitulosNuevos() {
  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const status = await getStatus();
        if (!status.conectado) {
          setError("No conectado a Mercado Libre. Autenticate primero.");
          return;
        }
        const data = await getCategoriasTendencias();
        setCategorias(data.categorias || []);
      } catch (err) {
        setError(err?.message || "Error al cargar categorias");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categoria = categorias.find((c) => c.id === categoriaId) || null;

  if (loading) return <div className="empty-state">Cargando tus categorias y sus tendencias... (puede tardar la primera vez)</div>;

  if (error) {
    return (
      <div className="empty-state">
        <p>{error}</p>
        {error.includes("No conectado") && (
          <button type="button" className="btn" onClick={redirectToMercadoLibreAuth}
            style={{ marginTop: 16, padding: "10px 24px", background: "var(--accent-a)", color: "#1a1a2e", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Conectar con Mercado Libre
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="panel" style={{ borderColor: "var(--accent-a)" }}>
      <header className="panel-head">
        <h2>Titulo para una publicacion nueva</h2>
        {categoria && <span>{categoria.keywords.length} busquedas en su categoria</span>}
      </header>

      <p style={{ color: "var(--muted)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 0 }}>
        Para un producto que todavia no publicaste. No hay visitas ni ventas que mirar, asi que
        el titulo se arma con lo que buscan los compradores y con lo que ya estan usando los que venden.
      </p>

      <div style={{ marginBottom: 20 }}>
        <label htmlFor="categoria" style={{ display: "block", fontSize: "0.82rem", color: "var(--muted)", marginBottom: 6 }}>
          Categoria mas parecida entre las que ya vendes (opcional, para traer las busquedas)
        </label>
        <select id="categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}
          className="dropdown-trigger" style={{ minWidth: 320, maxWidth: "100%" }}>
          <option value="">Sin categoria: solo competencia</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({c.publicaciones} pub.{c.keywords.length ? "" : " · sin tendencias"})
            </option>
          ))}
        </select>
      </div>

      {/* key: al cambiar de categoria el taller arranca limpio */}
      <TallerTitulo
        key={categoriaId || "sin-categoria"}
        keywords={categoria?.keywords || []}
        categoriaNombre={categoria?.nombre}
        placeholderTitulo="Escribi el producto que vas a publicar: Sandalia Niña Fiesta"
      />
    </section>
  );
}
