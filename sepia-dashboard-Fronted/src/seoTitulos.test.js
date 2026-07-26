import { describe, it, expect } from "vitest";
import {
  MAX_TITULO, palabrasDe, analizarTitulos, alternarPalabra, sugerirTitulo,
} from "./seoTitulos";

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
    keywordsTendencia: ["sandalias playa mujer", "zuecos mujer"],
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
