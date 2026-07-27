import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("../api", () => ({
  getStatus: vi.fn(async () => ({ conectado: true })),
  getCategoriasTendencias: vi.fn(async () => ({
    ok: true,
    categorias: [
      {
        id: "MCO416005", nombre: "Sandalias y Chanclas", publicaciones: 12,
        keywords: ["sandalias playa mujer", "sandalias mujer elegantes", "nike mind 001"],
      },
      { id: "MCO109027", nombre: "Vestidos", publicaciones: 4, keywords: [] },
    ],
  })),
  redirectToMercadoLibreAuth: vi.fn(),
}));

import SeoTitulosNuevos from "./SeoTitulosNuevos.jsx";

describe("SeoTitulosNuevos", () => {
  it("arranca sin categoria y con el titulo vacio", async () => {
    render(<SeoTitulosNuevos />);
    expect(await screen.findByText(/3\. Armar el titulo/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByPlaceholderText(/Escribi el producto que vas a publicar/)).toHaveValue("");
  });

  it("al elegir categoria trae solo las busquedas que van con lo que escribis", async () => {
    render(<SeoTitulosNuevos />);
    await screen.findByRole("combobox");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MCO416005" } });

    // sin producto escrito todavia no hay con que comparar
    expect(screen.getByText(/Escribi abajo que producto vas a publicar/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Escribi el producto que vas a publicar/), {
      target: { value: "Sandalia Niña Fiesta" },
    });

    expect(screen.getByRole("link", { name: /sandalias playa mujer/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /nike mind 001/ })).not.toBeInTheDocument();
  });

  it("los titulos de competencia mandan aunque no haya categoria", async () => {
    render(<SeoTitulosNuevos />);
    await screen.findByText(/3\. Armar el titulo/);

    fireEvent.change(screen.getByPlaceholderText(/Escribi el producto que vas a publicar/), {
      target: { value: "Sandalia Niña" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Sandalias Mujer Playa Comodas Verano/), {
      target: { value: "Sandalias Niña Fiesta Tacon\nSandalia Niña Ceremonia Tacon\nZapato Niña Tacon Fiesta" },
    });

    expect(screen.getByText("3 pegados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^tacon/ })).toBeInTheDocument();
  });
});
