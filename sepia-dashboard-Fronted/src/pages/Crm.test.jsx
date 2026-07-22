import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Crm, { CRM_URL, CRM_LOAD_TIMEOUT_MS } from "./Crm.jsx";
import { CRM_SECTIONS } from "../crmSections.js";

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/crm" element={<Crm />} />
      <Route path="/crm/:section" element={<Crm />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => {
  vi.useRealTimers();
});

describe("Crm", () => {
  it("muestra el spinner mientras el iframe no termino de cargar", () => {
    renderAt("/crm");
    expect(screen.getByText("Cargando CRM...")).toBeInTheDocument();
  });

  it("sin seccion en la URL, usa la primera de CRM_SECTIONS (Inicio)", () => {
    renderAt("/crm");
    const expected = `${CRM_URL}${CRM_SECTIONS[0].crmPath}`;
    expect(screen.getByTitle(`CRM Sepia - ${CRM_SECTIONS[0].label}`)).toHaveAttribute("src", expected);
  });

  it("con una seccion en la URL, arma el src de esa seccion", () => {
    const pipeline = CRM_SECTIONS.find((s) => s.slug === "pipeline");
    renderAt("/crm/pipeline");
    const expected = `${CRM_URL}${pipeline.crmPath}`;
    expect(screen.getByTitle(`CRM Sepia - ${pipeline.label}`)).toHaveAttribute("src", expected);
  });

  it("onLoad del iframe oculta el spinner", () => {
    renderAt("/crm");
    fireEvent.load(screen.getByTitle(`CRM Sepia - ${CRM_SECTIONS[0].label}`));
    expect(screen.queryByText("Cargando CRM...")).not.toBeInTheDocument();
  });

  it("si pasan 15s sin cargar, muestra error con boton Reintentar", () => {
    vi.useFakeTimers();
    renderAt("/crm");
    act(() => { vi.advanceTimersByTime(CRM_LOAD_TIMEOUT_MS); });
    expect(screen.getByText("El CRM no responde.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("Reintentar vuelve a mostrar el spinner", () => {
    vi.useFakeTimers();
    renderAt("/crm");
    act(() => { vi.advanceTimersByTime(CRM_LOAD_TIMEOUT_MS); });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(screen.getByText("Cargando CRM...")).toBeInTheDocument();
  });

  it("siempre muestra el link de salida a una pestana nueva, apuntando a la seccion actual", () => {
    const pipeline = CRM_SECTIONS.find((s) => s.slug === "pipeline");
    renderAt("/crm/pipeline");
    const link = screen.getByRole("link", { name: /Abrir CRM en pestaña nueva/ });
    expect(link).toHaveAttribute("href", `${CRM_URL}${pipeline.crmPath}`);
    expect(link).toHaveAttribute("target", "_blank");
  });
});
