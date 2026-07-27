import { describe, it, expect } from "vitest";
import {
  MAX_TITULO, palabrasDe, raiz, esRelacionada, analizarTitulos, alternarPalabra, sugerirTitulo, validarTitulo,
} from "./seoTitulos";

describe("raiz", () => {
  it("iguala singular y plural", () => {
    expect(raiz("sandalias")).toBe(raiz("sandalia"));
    expect(raiz("mujeres")).toBe("mujer");
  });

  it("no destroza palabras cortas", () => {
    expect(raiz("mes")).toBe("mes");
    expect(raiz("gas")).toBe("gas");
  });
});

describe("esRelacionada", () => {
  const titulo = "Sandalia Para Niña De Fiesta Elegante Primera Comunión";

  it("acepta la busqueda que comparte producto, aunque este en plural", () => {
    expect(esRelacionada("sandalias playa mujer", titulo)).toBe(true);
    expect(esRelacionada("sandalias mujer elegantes", titulo)).toBe(true);
  });

  it("descarta marcas ajenas de la misma categoria", () => {
    expect(esRelacionada("crocs rayo mcqueen", titulo)).toBe(false);
    expect(esRelacionada("nike mind 001", titulo)).toBe(false);
    expect(esRelacionada("zuecos mujer", titulo)).toBe(false);
  });
});

describe("palabrasDe", () => {
  it("quita tildes, conectores y fragmentos cortos", () => {
    expect(palabrasDe("Zapato De Fiesta Niña - Elegante")).toEqual([
      "zapato", "fiesta", "nina", "elegante",
    ]);
  });

  it("conserva medidas y tallas aunque sean cortas", () => {
    expect(palabrasDe("Sandalia 3x talla 38")).toEqual(["sandalia", "3x", "talla", "38"]);
  });
});

describe("analizarTitulos", () => {
  const base = {
    tituloActual: "Sandalia Comoda Para Dama",
    titulosCompetencia: [
      "Sandalias Mujer Playa Comodas",
      "Sandalia Mujer Verano Playa",
      "Zapato Mujer Playa",
    ],
    keywordsTendencia: ["sandalias playa mujer", "sandalias mujer comodas", "zuecos mujer"],
  };

  it("rankea primero lo que esta en tendencias y en varios competidores", () => {
    const { palabras } = analizarTitulos(base);
    expect(palabras[0].palabra).toBe("mujer"); // 3 competidores + 2 tendencias
    expect(palabras[0].score).toBe(5);
  });

  it("marca como faltante lo que usan otros y tu no", () => {
    const faltantes = analizarTitulos(base).faltantes.map((p) => p.palabra);
    expect(faltantes).toContain("mujer");
    expect(faltantes).toContain("playa");
    expect(faltantes).not.toContain("sandalia"); // ya esta en tu titulo
  });

  it("cuenta una vez por titulo aunque el competidor repita la palabra", () => {
    const { palabras } = analizarTitulos({
      tituloActual: "",
      titulosCompetencia: ["Bolso Bolso Bolso Cuero"],
      keywordsTendencia: [],
    });
    expect(palabras.find((p) => p.palabra === "bolso").competidores).toBe(1);
  });

  it("avisa que keyword de tendencia no estas cubriendo", () => {
    const { tendencias } = analizarTitulos(base);
    expect(tendencias.find((t) => t.keyword === "sandalias playa mujer").cubierta).toBe(false);
  });

  it("descarta busquedas de otro producto de la misma categoria", () => {
    const { palabras, tendencias } = analizarTitulos({
      tituloActual: "Sandalia Para Niña De Fiesta Elegante",
      titulosCompetencia: [],
      keywordsTendencia: ["sandalias playa mujer", "crocs rayo mcqueen", "nike mind 001"],
    });
    const chips = palabras.filter((p) => p.score > 0).map((p) => p.palabra);
    expect(chips).not.toContain("mcqueen");
    expect(chips).not.toContain("nike");
    // igual quedan listadas para poder mirarlas, pero marcadas como no relacionadas
    expect(tendencias.find((t) => t.keyword === "nike mind 001").relacionada).toBe(false);
  });

  it("nunca sugiere una marca ajena que aparece en una sola busqueda", () => {
    // Caso real de Sepia: la categoria Sandalias y Chanclas devuelve estas.
    const { palabras } = analizarTitulos({
      tituloActual: "Sandalia Para Niña De Fiesta Elegante Primera Comunión",
      titulosCompetencia: [],
      keywordsTendencia: [
        "sandalias playa mujer", "sandalias skechers mujer", "sandalias shark",
        "sandalias birkenstock colombia", "sandalias mujer elegantes", "sandalia hombre",
      ],
    });
    const sugeridas = palabras.filter((p) => p.score > 0).map((p) => p.palabra);
    for (const marca of ["skechers", "shark", "birkenstock", "colombia"]) {
      expect(sugeridas).not.toContain(marca);
    }
    // "mujer" sale en 3 busquedas distintas: eso si es demanda real
    expect(sugeridas).toContain("mujer");
  });

  it("mide la relevancia contra el titulo original, no contra lo que vas escribiendo", () => {
    const { tendencias } = analizarTitulos({
      tituloActual: "Zapato",
      tituloBase: "Sandalia Para Niña",
      titulosCompetencia: [],
      keywordsTendencia: ["sandalias playa mujer"],
    });
    expect(tendencias[0].relacionada).toBe(true);
  });

  it("delata las palabras que solo usas tu", () => {
    const soloTuyas = analizarTitulos(base).soloTuyas.map((p) => p.palabra);
    expect(soloTuyas).toContain("dama");
  });
});

describe("alternarPalabra", () => {
  it("agrega si no esta y quita si ya esta, sin importar tildes", () => {
    expect(alternarPalabra("Sandalia Comoda", "playa")).toBe("Sandalia Comoda playa");
    expect(alternarPalabra("Zapato Niña Fiesta", "nina")).toBe("Zapato Fiesta");
  });
});

describe("validarTitulo", () => {
  const mensajes = (t) => validarTitulo(t).map((a) => a.mensaje).join(" | ");

  it("no dice nada de un titulo vacio", () => {
    expect(validarTitulo("")).toEqual([]);
  });

  it("marca error cuando se pasa de 60", () => {
    const largo = "Sandalia Para Niña De Fiesta Elegante Primera Comunion Blanca Tacon";
    const error = validarTitulo(largo).find((a) => a.nivel === "error");
    expect(error.mensaje).toMatch(/Te pasaste por 7 caracteres/);
  });

  it("avisa cuando quedan caracteres sin usar", () => {
    expect(mensajes("Sandalia Niña")).toMatch(/sobran 47 caracteres/);
  });

  it("detecta palabras repetidas aunque cambie el plural", () => {
    expect(mensajes("Sandalia Niña Fiesta Sandalias Elegantes")).toMatch(/Repetis sandalia/);
  });

  it("detecta la condicion, que MeLi pide no poner", () => {
    expect(mensajes("Sandalia Niña Fiesta Elegante Nueva Original")).toMatch(/Sacá "Nueva"/);
  });

  it("detecta envio y medios de pago", () => {
    expect(mensajes("Sandalia Niña Fiesta Envio Gratis")).toMatch(/Sacá "Envio Gratis"/);
    expect(mensajes("Sandalia Niña Fiesta 12 Cuotas Sin Interes")).toMatch(/cuotas/i);
  });

  it("detecta simbolos raros", () => {
    expect(mensajes("Sandalia Niña Fiesta !! Elegante")).toMatch(/simbolo "!"/);
  });

  it("detecta mayusculas sostenidas", () => {
    expect(mensajes("SANDALIA NIÑA FIESTA ELEGANTE COMUNION")).toMatch(/MAYUSCULAS/);
  });

  it("deja pasar limpio un titulo que cumple", () => {
    expect(validarTitulo("Sandalia Niña Fiesta Elegante Tacon Bajo Ceremonia")).toEqual([]);
  });
});

describe("sugerirTitulo", () => {
  it("mantiene tu titulo y suma lo que falta sin pasarse de 60", () => {
    const faltantes = [{ palabra: "mujer" }, { palabra: "playa" }];
    const sugerido = sugerirTitulo("Sandalia Comoda Para Dama", faltantes);
    expect(sugerido).toBe("Sandalia Comoda Para Dama mujer playa");
    expect(sugerido.length).toBeLessThanOrEqual(MAX_TITULO);
  });

  it("nunca devuelve mas de 60 caracteres", () => {
    const largo = "Sandalia Comoda Para Dama En Cuero Natural Hecha A Mano Colombia Premium";
    const faltantes = [{ palabra: "mujer" }, { palabra: "playa" }];
    expect(sugerirTitulo(largo, faltantes).length).toBeLessThanOrEqual(MAX_TITULO);
  });

  it("salta la palabra que no cabe pero prueba la siguiente mas corta", () => {
    const base = "a".repeat(50);
    const faltantes = [{ palabra: "larguisimapalabra" }, { palabra: "playa" }];
    expect(sugerirTitulo(base, faltantes)).toBe(`${base} playa`);
  });
});
