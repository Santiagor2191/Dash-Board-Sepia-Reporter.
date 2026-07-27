import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("../api", () => ({
  getStatus: vi.fn(async () => ({ conectado: true })),
  getSeoTitulos: vi.fn(async () => ({
    ok: true,
    total: 1,
    categorias_sin_tendencias: 0,
    items: [{
      id: "MCO123",
      title: "Sandalia Para Niña De Fiesta Elegante Primera Comunión",
      diagnosis: "sin_traccion",
      visits_30d: 6,
      sold_30d: 0,
      permalink: "https://articulo.mercadolibre.com.co/MCO123",
      category_id: "MCO416005",
      category_name: "Sandalias y Chanclas",
      keywords: [
        "zuecos mujer", "sandalias playa mujer", "sandalias mujer elegantes",
        "nike mind 001", "sandalias skechers mujer",
      ],
    }],
  })),
  redirectToMercadoLibreAuth: vi.fn(),
}));

import SeoTitulos from "./SeoTitulos.jsx";

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("SeoTitulos", () => {
  it("muestra la tarjeta con los 3 pasos al elegir una publicacion", async () => {
    render(<SeoTitulos />);

    await screen.findByRole("button", { name: "Trabajar" });
    fireEvent.click(screen.getByRole("button", { name: "Trabajar" }));

    expect(await screen.findByText(/1\. Que busca la gente/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Titulos de la competencia/)).toBeInTheDocument();
    expect(screen.getByText(/3\. Armar el titulo/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Sandalia Para Niña De Fiesta/)).toBeInTheDocument();
  });

  it("solo lista las busquedas relacionadas y esconde el resto", async () => {
    render(<SeoTitulos />);
    fireEvent.click(await screen.findByRole("button", { name: "Trabajar" }));

    expect(screen.getByRole("link", { name: /sandalias playa mujer/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /nike mind 001/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Ver las otras 2 busquedas/));
    expect(screen.getByRole("link", { name: /nike mind 001/ })).toBeInTheDocument();
  });

  it("no ofrece marcas ajenas como palabras del titulo", async () => {
    render(<SeoTitulos />);
    fireEvent.click(await screen.findByRole("button", { name: "Trabajar" }));

    await waitFor(() => expect(screen.getByText(/3\. Armar el titulo/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /skechers/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nike/ })).not.toBeInTheDocument();
  });

  it("cierra la tarjeta", async () => {
    render(<SeoTitulos />);
    fireEvent.click(await screen.findByRole("button", { name: "Trabajar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByText(/1\. Que busca la gente/)).not.toBeInTheDocument();
  });
});
