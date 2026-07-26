// Analisis de titulos para SEO de Mercado Libre.
// Todo es conteo de palabras: nada de IA, nada de scraping. Los titulos de la
// competencia los pega Santiago a mano (la API de MeLi no deja leerlos).

export const MAX_TITULO = 60;

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "para", "con", "sin", "y", "o", "en", "por", "a", "al", "su", "sus",
  "es", "son", "mas", "que", "the", "of",
]);

export const normalizar = (texto = "") =>
  String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Palabras que cuentan para SEO: fuera conectores y fragmentos de 1-2 letras,
// pero se quedan los que llevan numero ("3x", "40ml") porque suelen ser talla o medida.
export const palabrasDe = (texto = "") =>
  normalizar(texto)
    .split(" ")
    .filter((palabra) => palabra && !STOPWORDS.has(palabra) && (palabra.length >= 3 || /\d/.test(palabra)));

export const analizarTitulos = ({
  tituloActual = "",
  titulosCompetencia = [],
  keywordsTendencia = [],
}) => {
  const mias = new Set(palabrasDe(tituloActual));
  const deTendencia = new Set(keywordsTendencia.flatMap((keyword) => palabrasDe(keyword)));

  const competencia = titulosCompetencia
    .map((titulo) => String(titulo).trim())
    .filter(Boolean);

  // Cuenta EN CUANTOS titulos aparece la palabra, no cuantas veces en total:
  // que un competidor repita "sandalia" tres veces no la hace mas importante.
  const frecuencia = new Map();
  for (const titulo of competencia) {
    for (const palabra of new Set(palabrasDe(titulo))) {
      frecuencia.set(palabra, (frecuencia.get(palabra) || 0) + 1);
    }
  }

  const palabras = [...new Set([...frecuencia.keys(), ...deTendencia, ...mias])]
    .map((palabra) => {
      const competidores = frecuencia.get(palabra) || 0;
      const enTendencias = deTendencia.has(palabra);
      return {
        palabra,
        competidores,
        enTendencias,
        enTuTitulo: mias.has(palabra),
        // Estar en las tendencias de MeLi pesa como dos competidores: es demanda
        // medida por MeLi, no la corazonada de un vendedor.
        score: competidores + (enTendencias ? 2 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.palabra.localeCompare(b.palabra));

  return {
    palabras,
    faltantes: palabras.filter((p) => !p.enTuTitulo && p.score > 0),
    soloTuyas: palabras.filter((p) => p.enTuTitulo && p.score === 0),
    tendencias: keywordsTendencia.map((keyword) => ({
      keyword,
      cubierta: palabrasDe(keyword).every((palabra) => mias.has(palabra)),
    })),
    totalCompetidores: competencia.length,
  };
};

export const tieneP = (titulo, palabra) => palabrasDe(titulo).includes(palabra);

export const alternarPalabra = (titulo, palabra) => {
  const base = String(titulo).trim();
  if (!tieneP(base, palabra)) return `${base} ${palabra}`.trim();

  return base
    .split(/\s+/)
    .filter((token) => normalizar(token) !== palabra)
    .join(" ")
    .trim();
};

// Arranca del titulo que YA escribio Santiago (tiene su criterio) y le va
// pegando las palabras que le faltan mientras quepan en los 60 caracteres.
export const sugerirTitulo = (tituloActual, faltantes = [], limite = MAX_TITULO) => {
  let resultado = String(tituloActual).trim().slice(0, limite).trim();

  for (const { palabra } of faltantes) {
    const candidato = `${resultado} ${palabra}`.trim();
    if (candidato.length <= limite) resultado = candidato;
  }

  return resultado;
};
