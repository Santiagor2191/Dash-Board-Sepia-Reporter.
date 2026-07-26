import { useEffect, useMemo, useRef, useState } from "react";
import { getSeoTitulos, getStatus, redirectToMercadoLibreAuth } from "../api";
import { fNumber } from "../utils";
import {
  MAX_TITULO, analizarTitulos, alternarPalabra, sugerirTitulo,
} from "../seoTitulos";

const DIAGNOSIS_LABEL = {
  visitas_sin_conversion: { label: "Visitas sin conversion", color: "#ef4444" },
  sin_traccion: { label: "Sin traccion", color: "#94a3b8" },
  buena_conversion_pocas_visitas: { label: "Pocas visitas", color: "#f59e0b" },
};

export default function SeoTitulos() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seleccionadaId, setSeleccionadaId] = useState(null);
  const [competencia, setCompetencia] = useState("");
  const [borrador, setBorrador] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [verOtras, setVerOtras] = useState(false);
  const tarjetaRef = useRef(null);

  const fetchData = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const status = await getStatus();
      if (!status.conectado) {
        setError("No conectado a Mercado Libre. Autenticate primero.");
        return;
      }
      setData(await getSeoTitulos(force));
    } catch (err) {
      setError(err?.message || "Error al cargar tendencias");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const seleccionada = useMemo(
    () => data?.items?.find((item) => item.id === seleccionadaId) || null,
    [data, seleccionadaId],
  );

  const elegir = (item) => {
    setSeleccionadaId(item.id);
    setCompetencia("");
    setBorrador(item.title || "");
    setCopiado(false);
    setVerOtras(false);
  };

  // Con 108 filas arriba, la tarjeta queda lejos: llevarla a la vista.
  useEffect(() => {
    if (seleccionadaId) tarjetaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [seleccionadaId]);

  const titulosCompetencia = useMemo(
    () => competencia.split("\n").map((t) => t.trim()).filter(Boolean),
    [competencia],
  );

  const analisis = useMemo(() => {
    if (!seleccionada) return null;
    return analizarTitulos({
      tituloActual: borrador,
      tituloBase: seleccionada.title || "",
      titulosCompetencia,
      keywordsTendencia: seleccionada.keywords || [],
    });
  }, [seleccionada, borrador, titulosCompetencia]);

  const relacionadas = analisis?.tendencias.filter((t) => t.relacionada) || [];
  const otras = analisis?.tendencias.filter((t) => !t.relacionada) || [];

  const copiar = async () => {
    await navigator.clipboard.writeText(borrador);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  if (loading) return <div className="empty-state">Buscando publicaciones flojas y tendencias de MeLi... (puede tardar unos segundos)</div>;

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

  if (!data) return null;

  const largo = borrador.trim().length;

  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <h2>Publicaciones flojas</h2>
          <button className="btn" onClick={() => fetchData(true)} style={{ fontSize: "0.78rem", padding: "6px 12px" }}>Actualizar</button>
        </header>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 0 }}>
          {fNumber(data.total)} publicaciones con problema de visitas o conversion.
          Elegi una para ver que busca la gente en su categoria.
          {data.categorias_sin_tendencias > 0 && ` (${data.categorias_sin_tendencias} categorias no tienen tendencias publicadas por MeLi)`}
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Diagnostico</th>
                <th>Titulo actual</th>
                <th style={{ textAlign: "center" }}>Largo</th>
                <th style={{ textAlign: "center" }}>Visitas</th>
                <th style={{ textAlign: "center" }}>Ventas</th>
                <th style={{ textAlign: "center" }}>Keywords</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items?.length ? data.items.map((item) => {
                const diag = DIAGNOSIS_LABEL[item.diagnosis] || { label: item.diagnosis, color: "var(--muted)" };
                return (
                  <tr key={item.id} style={{ background: item.id === seleccionadaId ? "rgba(184,115,51,0.10)" : undefined }}>
                    <td><span className="pill" style={{ color: diag.color, borderColor: diag.color, fontWeight: 600 }}>{diag.label}</span></td>
                    <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</td>
                    <td style={{ textAlign: "center", color: (item.title?.length || 0) < 45 ? "#f59e0b" : undefined }}>
                      {item.title?.length || 0}
                    </td>
                    <td style={{ textAlign: "center" }}>{fNumber(item.visits_30d)}</td>
                    <td style={{ textAlign: "center" }}>{fNumber(item.sold_30d)}</td>
                    <td style={{ textAlign: "center", color: item.keywords?.length ? undefined : "var(--muted)" }}>
                      {item.keywords?.length || "-"}
                    </td>
                    <td>
                      <button className="btn" onClick={() => elegir(item)} style={{ fontSize: "0.75rem", padding: "4px 10px" }}>
                        Trabajar
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="7" className="table-empty">Ninguna publicacion floja. Buena senal.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {seleccionada && analisis && (
        <section className="panel" ref={tarjetaRef} style={{ borderColor: "var(--accent-a)" }}>
          <header className="panel-head">
            <h2>{seleccionada.title}</h2>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <a href={seleccionada.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-a)", fontSize: "0.78rem" }}>Ver en MeLi</a>
              <button className="btn" onClick={() => setSeleccionadaId(null)} style={{ fontSize: "0.75rem", padding: "4px 10px" }}>Cerrar</button>
            </div>
          </header>

          <div style={{ display: "grid", gap: 22 }}>
            <div>
              <h3 style={{ fontSize: "0.9rem", margin: "0 0 4px" }}>
                1. Que busca la gente en {seleccionada.category_name || seleccionada.category_id}
              </h3>

              {relacionadas.length ? (
                <>
                  <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "0 0 10px", lineHeight: 1.6 }}>
                    Busquedas reales de MeLi que tienen que ver con tu producto. En verde las que tu titulo ya cubre.
                    Hace clic para abrirlas y ver quien esta ganando.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {relacionadas.map(({ keyword, cubierta }) => (
                      <a key={keyword}
                        href={`https://listado.mercadolibre.com.co/${keyword.replace(/\s+/g, "-")}`}
                        target="_blank" rel="noopener noreferrer" className="pill"
                        style={{
                          textDecoration: "none", fontSize: "0.82rem", padding: "6px 12px",
                          color: cubierta ? "#22c55e" : "var(--text)",
                          borderColor: cubierta ? "#22c55e" : undefined,
                          background: cubierta ? "rgba(34,197,94,0.10)" : undefined,
                        }}>
                        {cubierta ? "* " : ""}{keyword}
                      </a>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "0 0 10px", lineHeight: 1.6 }}>
                  Ninguna de las busquedas de esta categoria tiene que ver con tu producto.
                  {otras.length > 0 && " Puede ser senal de que la publicacion esta en la categoria equivocada."}
                  {" "}Pega titulos de competidores en el paso 2, que es la senal que si te sirve.
                </p>
              )}

              {otras.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={() => setVerOtras((v) => !v)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--muted)", fontSize: "0.78rem", textDecoration: "underline" }}>
                    {verOtras ? "Ocultar" : `Ver las otras ${otras.length} busquedas de la categoria (marcas y productos que no vendes)`}
                  </button>
                  {verOtras && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, opacity: 0.55 }}>
                      {otras.map(({ keyword }) => (
                        <a key={keyword}
                          href={`https://listado.mercadolibre.com.co/${keyword.replace(/\s+/g, "-")}`}
                          target="_blank" rel="noopener noreferrer" className="pill"
                          style={{ textDecoration: "none", fontSize: "0.8rem", padding: "5px 10px" }}>
                          {keyword}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <h3 style={{ fontSize: "0.9rem", margin: "0 0 4px" }}>
                2. Titulos de la competencia
                <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 8 }}>{titulosCompetencia.length} pegados</span>
              </h3>
              <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "0 0 10px", lineHeight: 1.6 }}>
                Abri una busqueda de arriba, copia el titulo de los 6 a 10 primeros resultados y pegalos aca,
                uno por linea. La API de MeLi no deja leerlos, por eso van a mano.
              </p>
              <textarea
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                rows={7}
                placeholder={"Sandalias Mujer Playa Comodas Verano\nSandalia Dama Plataforma Comoda\n..."}
                style={{
                  width: "100%", padding: 12, borderRadius: 8, resize: "vertical",
                  background: "var(--panel-2, rgba(0,0,0,0.15))", color: "var(--text)",
                  border: "1px solid var(--line)", fontSize: "0.85rem", fontFamily: "inherit", lineHeight: 1.6,
                }}
              />
            </div>

            <div>
              <h3 style={{ fontSize: "0.9rem", margin: "0 0 10px", display: "flex", justifyContent: "space-between" }}>
                <span>3. Armar el titulo</span>
                <span style={{ color: largo > MAX_TITULO ? "#ef4444" : largo < 45 ? "#f59e0b" : "#22c55e" }}>
                  {largo} / {MAX_TITULO}
                </span>
              </h3>

              <input
              type="text" value={borrador} onChange={(e) => setBorrador(e.target.value)}
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 8, fontSize: "0.95rem",
                background: "var(--panel-2, rgba(0,0,0,0.15))", color: "var(--text)",
                border: `1px solid ${largo > MAX_TITULO ? "#ef4444" : "var(--line)"}`,
              }}
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button className="btn" onClick={() => setBorrador(sugerirTitulo(seleccionada.title, analisis.faltantes))}
                style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
                Sugerir
              </button>
              <button className="btn" onClick={() => setBorrador(seleccionada.title || "")} style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
                Volver al original
              </button>
              <button className="btn" onClick={copiar}
                style={{ fontSize: "0.8rem", padding: "6px 14px", background: "var(--accent-a)", color: "#1a1a2e", border: "none", fontWeight: 600 }}>
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>

            <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 14, marginBottom: 8, lineHeight: 1.6 }}>
              Hace clic en una palabra para meterla o sacarla del titulo.
              El numero es en cuantos titulos de la competencia aparece; el asterisco es que MeLi la reporta como busqueda real.
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {analisis.palabras.filter((p) => p.score > 0 || p.enTuTitulo).slice(0, 40).map((p) => (
                <button key={p.palabra} type="button" className="pill"
                  onClick={() => setBorrador((actual) => alternarPalabra(actual, p.palabra))}
                  title={`${p.competidores} de ${analisis.totalCompetidores} competidores${p.enTendencias ? " · en tendencias de MeLi" : ""}`}
                  style={{
                    cursor: "pointer", fontSize: "0.82rem", padding: "6px 12px",
                    color: p.enTuTitulo ? "#22c55e" : p.score === 0 ? "var(--muted)" : "var(--text)",
                    borderColor: p.enTuTitulo ? "#22c55e" : undefined,
                    background: p.enTuTitulo ? "rgba(34,197,94,0.10)" : "transparent",
                  }}>
                  {p.palabra}
                  {p.competidores > 0 && <strong style={{ marginLeft: 6 }}>{p.competidores}</strong>}
                  {p.enTendencias && <span style={{ marginLeft: 4, color: "var(--accent-a)" }}>*</span>}
                </button>
              ))}
            </div>

            {analisis.soloTuyas.length > 0 && (
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 14, lineHeight: 1.6 }}>
                <strong>Solo vos usas:</strong> {analisis.soloTuyas.map((p) => p.palabra).join(", ")}.
                Ni la competencia ni las busquedas de MeLi las mencionan. Si te sobran caracteres, son las primeras candidatas a salir.
              </p>
            )}

              <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 14, lineHeight: 1.6 }}>
                Copia el titulo y pegalo en MeLi a mano. Confirmado que MeLi acepta cambiar el titulo aunque la publicacion tenga ventas.
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
