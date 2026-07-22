import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Crm, { CRM_URL, CRM_LOAD_TIMEOUT_MS } from "./Crm.jsx";

afterEach(() => {
  vi.useRealTimers();
});

describe("Crm", () => {
  it("muestra el spinner mientras el iframe no termino de cargar", () => {
    render(<Crm />);
    expect(screen.getByText("Cargando CRM...")).toBeInTheDocument();
  });

  it("el iframe apunta a CRM_URL", () => {
    render(<Crm />);
    expect(screen.getByTitle("CRM Sepia")).toHaveAttribute("src", CRM_URL);
  });

  it("onLoad del iframe oculta el spinner", () => {
    render(<Crm />);
    fireEvent.load(screen.getByTitle("CRM Sepia"));
    expect(screen.queryByText("Cargando CRM...")).not.toBeInTheDocument();
  });

  it("si pasan 15s sin cargar, muestra error con boton Reintentar", () => {
    vi.useFakeTimers();
    render(<Crm />);
    act(() => { vi.advanceTimersByTime(CRM_LOAD_TIMEOUT_MS); });
    expect(screen.getByText("El CRM no responde.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("Reintentar vuelve a mostrar el spinner", () => {
    vi.useFakeTimers();
    render(<Crm />);
    act(() => { vi.advanceTimersByTime(CRM_LOAD_TIMEOUT_MS); });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(screen.getByText("Cargando CRM...")).toBeInTheDocument();
  });

  it("siempre muestra el link de salida a una pestana nueva", () => {
    render(<Crm />);
    const link = screen.getByRole("link", { name: /Abrir CRM en pestaña nueva/ });
    expect(link).toHaveAttribute("href", CRM_URL);
    expect(link).toHaveAttribute("target", "_blank");
  });
});
