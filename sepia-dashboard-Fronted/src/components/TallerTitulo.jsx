import { useMemo, useState } from "react";
import {
  MAX_TITULO, analizarTitulos, alternarPalabra, sugerirTitulo,
} from "../seoTitulos";

// El taller que comparten las dos pantallas de SEO: publicaciones que ya
// existen y publicaciones nuevas. Solo cambia de donde sale el titulo base.
//
// tituloBase fijo (publicacion existente) => la relevancia de las busquedas se
// mide contra ese titulo. Sin tituloBase (publicacion nueva) => se mide contra
// lo que va escribiendo, porque todavia no hay producto publicado.
export default function TallerTitulo({
  keywords = [],
  categoriaNombre,
  tituloBase = null,
  placeholderTitulo = "Escribi el producto: Sandalia Niña Fiesta Elegante",
}) {
  const [competencia, setCompetencia] = useState("");
  const [borrador, setBorrador] = useState(tituloBase || "");
  const [copiado, setCopiado] = useState(false);
  const [verOtras, setVerOtras] = useState(false);

  // Para reiniciar el taller al cambiar de publicacion, el padre pasa un `key`
  // distinto: React lo remonta solo. Mas simple que sincronizar con useEffect.
  const titulosCompetencia = useMemo(
    () => competencia.split("\n").map((t) => t.trim()).filter(Boolean),
    [competencia],
  );

  const analisis = useMemo(() => analizarTitulos({
    tituloActual: borrador,
    tituloBase: tituloBase || borrador,
    titulosCompetencia,
    keywordsTendencia: keywords,
  }), [borrador, tituloBase, titulosCompetencia, keywords]);

  const relacionadas = analisis.tendencias.filter((t) => t.relacionada);
  const otras = analisis.tendencias.filter((t) => !t.relacionada);
  const largo = borrador.trim().length;

  const copiar = async () => {
    await navigator.clipboard.writeText(borrador);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const enlaceBusqueda = (keyword) =>
    `https://listado.mercadolibre.com.co/${keyword.replace(/\s+/g, "-")}`;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div>
        <h3 style={{ fontSize: "0.9rem", margin: "0 0 4px" }}>
          1. Que busca la gente{categoriaNombre ? ` en ${categoriaNombre}` : ""}
        </h3>

        {relacionadas.length ? (
          <>
            <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "0 0 10px", lineHeight: 1.6 }}>
              Busquedas reales de MeLi que tienen que ver con tu producto. En verde las que tu titulo ya cubre.
              Hace clic para abrirlas y ver quien esta ganando.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {relacionadas.map(({ keyword, cubierta }) => (
                <a key={keyword} href={enlaceBusqueda(keyword)} target="_blank" rel="noopener noreferrer" className="pill"
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
            {keywords.length === 0
              ? "Elegi una categoria para ver que se busca. Igual podes trabajar solo con los titulos de la competencia."
              : borrador.trim().length === 0
                ? "Escribi abajo que producto vas a publicar y aca aparecen las busquedas que tengan que ver."
                : "Ninguna de las busquedas de esta categoria tiene que ver con tu producto. Los titulos de la competencia son la senal que si te sirve."}
          </p>
        )}

        {otras.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={() => setVerOtras((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text)", fontSize: "0.8rem", fontWeight: 600, textDecoration: "underline" }}>
              {verOtras ? "Ocultar" : `Ver las otras ${otras.length} busquedas de la categoria (marcas y productos que no vendes)`}
            </button>
            {verOtras && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {otras.map(({ keyword }) => (
                  <a key={keyword} href={enlaceBusqueda(keyword)} target="_blank" rel="noopener noreferrer" className="pill"
                    style={{
                      textDecoration: "none", fontSize: "0.8rem", padding: "5px 10px",
                      color: "var(--text)", fontWeight: 600,
                    }}>
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
          placeholder={placeholderTitulo}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 8, fontSize: "0.95rem",
            background: "var(--panel-2, rgba(0,0,0,0.15))", color: "var(--text)",
            border: `1px solid ${largo > MAX_TITULO ? "#ef4444" : "var(--line)"}`,
          }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button className="btn" onClick={() => setBorrador(sugerirTitulo(borrador, analisis.faltantes))}
            style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
            Sugerir
          </button>
          {tituloBase && (
            <button className="btn" onClick={() => setBorrador(tituloBase)} style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
              Volver al original
            </button>
          )}
          <button className="btn" onClick={copiar} disabled={!borrador.trim()}
            style={{ fontSize: "0.8rem", padding: "6px 14px", background: "var(--accent-a)", color: "#1a1a2e", border: "none", fontWeight: 600, opacity: borrador.trim() ? 1 : 0.4 }}>
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
      </div>
    </div>
  );
}
