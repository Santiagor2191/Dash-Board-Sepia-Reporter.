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

// "sandalias" y "sandalia" son la misma palabra para el comprador. Sin esto,
// una busqueda relevante se veria como ajena solo por el plural.
export const raiz = (palabra = "") => {
  if (palabra.length > 4 && palabra.endsWith("es")) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
};

const raicesDe = (texto) => new Set(palabrasDe(texto).map(raiz));

// Las tendencias son de la CATEGORIA entera, no del nicho. En "Sandalias y
// Chanclas" aparecen "nike mind 001" y "crocs rayo mcqueen", que no tienen
// nada que ver con una sandalia de nina de fiesta. Solo cuentan las busquedas
// que comparten alguna palabra con el producto.
export const esRelacionada = (keyword, tituloBase) => {
  const delProducto = raicesDe(tituloBase);
  return palabrasDe(keyword).some((palabra) => delProducto.has(raiz(palabra)));
};

export const analizarTitulos = ({
  tituloActual = "",
  tituloBase = tituloActual,
  titulosCompetencia = [],
  keywordsTendencia = [],
}) => {
  // Por raiz: si el titulo dice "Sandalia", no tiene sentido pedirle "sandalias".
  const mias = raicesDe(tituloActual);
  const relacionadas = keywordsTendencia.filter((keyword) => esRelacionada(keyword, tituloBase));

  // Una palabra que aparece en UNA sola busqueda casi siempre es una marca ajena
  // ("sandalias skechers mujer", "sandalias birkenstock colombia"). Sugerirla
  // seria peligroso: poner una marca que no vendes puede costarte la publicacion.
  // Lo que de verdad busca la gente se repite en varias busquedas.
  const vecesEnTendencias = new Map();
  for (const keyword of relacionadas) {
    for (const palabra of new Set(palabrasDe(keyword).map(raiz))) {
      vecesEnTendencias.set(palabra, (vecesEnTendencias.get(palabra) || 0) + 1);
    }
  }
  const deTendencia = new Set(
    relacionadas
      .flatMap((keyword) => palabrasDe(keyword))
      .filter((palabra) => (vecesEnTendencias.get(raiz(palabra)) || 0) >= 2),
  );

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
        enTuTitulo: mias.has(raiz(palabra)),
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
      cubierta: palabrasDe(keyword).every((palabra) => mias.has(raiz(palabra))),
      relacionada: relacionadas.includes(keyword),
    })),
    totalCompetidores: competencia.length,
  };
};

export const tieneP = (titulo, palabra) => raicesDe(titulo).has(raiz(palabra));

export const alternarPalabra = (titulo, palabra) => {
  const base = String(titulo).trim();
  if (!tieneP(base, palabra)) return `${base} ${palabra}`.trim();

  return base
    .split(/\s+/)
    .filter((token) => raiz(normalizar(token)) !== raiz(palabra))
    .join(" ")
    .trim();
};

// Reglas oficiales de MeLi para titulos (ayuda de MeLi + guia de vendedores):
// estructura Producto + Marca + Modelo, maximo 60 caracteres, sin repetir lo
// que ya esta en la ficha tecnica, sin condicion, sin envio/pago, sin simbolos.
const CONDICION = /\b(nuevo|nueva|usado|usada|seminuevo|reacondicionado|original(es)?)\b/i;
const ENVIO_PAGO = /(envio|envío)\s*(gratis|nacional)|contra\s*entrega|mercadopago|mercado\s*pago|cuotas|domicilio\s*gratis|garantia|garantía|oferta|promocion|promoción|descuento/i;
const SIMBOLOS = /[#%@!¡?¿*+_=<>{}[\]|~^"]/;

export const validarTitulo = (titulo = "") => {
  const texto = String(titulo).trim();
  const avisos = [];
  if (!texto) return avisos;

  if (texto.length > MAX_TITULO) {
    avisos.push({ nivel: "error", mensaje: `Te pasaste por ${texto.length - MAX_TITULO} caracteres. MeLi corta en ${MAX_TITULO}.` });
  } else if (texto.length < 45) {
    avisos.push({ nivel: "aviso", mensaje: `Te sobran ${MAX_TITULO - texto.length} caracteres sin usar. Cada palabra de mas es otra busqueda por la que te pueden encontrar.` });
  }

  const palabras = palabrasDe(texto).map(raiz);
  const repetidas = [...new Set(palabras.filter((p, i) => palabras.indexOf(p) !== i))];
  if (repetidas.length) {
    avisos.push({ nivel: "aviso", mensaje: `Repetis ${repetidas.join(", ")}. Repetir no posiciona mejor y te come caracteres.` });
  }

  const condicion = texto.match(CONDICION);
  if (condicion) {
    avisos.push({ nivel: "aviso", mensaje: `Sacá "${condicion[0]}": la condicion ya se muestra sola, en el titulo solo ocupa lugar.` });
  }

  const envio = texto.match(ENVIO_PAGO);
  if (envio) {
    avisos.push({ nivel: "aviso", mensaje: `Sacá "${envio[0]}": MeLi ya lo muestra al lado del producto y no posiciona.` });
  }

  const simbolo = texto.match(SIMBOLOS);
  if (simbolo) {
    avisos.push({ nivel: "aviso", mensaje: `El simbolo "${simbolo[0]}" no ayuda a que te encuentren.` });
  }

  const letras = texto.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ]/g, "");
  const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length;
  if (letras.length > 10 && mayus / letras.length > 0.6) {
    avisos.push({ nivel: "aviso", mensaje: "Evita las MAYUSCULAS sostenidas: se lee peor y no posiciona mejor." });
  }

  return avisos;
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
