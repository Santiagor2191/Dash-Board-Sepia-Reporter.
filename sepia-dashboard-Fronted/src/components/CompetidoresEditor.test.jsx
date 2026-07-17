import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CompetidoresEditor from "./CompetidoresEditor.jsx";
import * as api from "../api.js";

vi.mock("../api.js", () => ({
  getCompetidoresSocial: vi.fn(),
  createCompetidorSocial: vi.fn(),
  updateCompetidorSocial: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("CompetidoresEditor", () => {
  it("lista vacía: muestra estado vacío con CTA", async () => {
    api.getCompetidoresSocial.mockResolvedValue({ competidores: [] });
    render(<CompetidoresEditor />);
    await waitFor(() =>
      expect(screen.getByText(/todavía no cargaste competidores/i)).toBeInTheDocument(),
    );
  });

  it("guardar exitoso: refresca la lista", async () => {
    api.getCompetidoresSocial
      .mockResolvedValueOnce({ competidores: [] })
      .mockResolvedValueOnce({
        competidores: [{ id: 1, plataforma: "instagram", handle: "nuevo", nombre_visible: "Nuevo", activo: true, last_error: null, last_synced_at: null }],
      });
    api.createCompetidorSocial.mockResolvedValue({ ok: true });

    render(<CompetidoresEditor />);
    await waitFor(() => expect(screen.getByText(/todavía no cargaste/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("handle"), { target: { value: "nuevo" } });
    fireEvent.click(screen.getByText("Agregar competidor"));

    await waitFor(() => expect(screen.getByText("Nuevo")).toBeInTheDocument());
    expect(api.createCompetidorSocial).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "nuevo", plataforma: "instagram" }),
    );
  });

  it("error al guardar: muestra mensaje claro y no pierde lo tipeado", async () => {
    api.getCompetidoresSocial.mockResolvedValue({ competidores: [] });
    api.createCompetidorSocial.mockRejectedValue(new Error("Ya existe ese competidor"));

    render(<CompetidoresEditor />);
    await waitFor(() => expect(screen.getByText(/todavía no cargaste/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("handle"), { target: { value: "repetido" } });
    fireEvent.click(screen.getByText("Agregar competidor"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ya existe ese competidor"));
    // El handle tipeado sigue en el input, no se perdió
    expect(screen.getByLabelText("handle")).toHaveValue("repetido");
  });

  it("muestra 'sin datos recientes' cuando el competidor tiene last_error", async () => {
    api.getCompetidoresSocial.mockResolvedValue({
      competidores: [{ id: 2, plataforma: "instagram", handle: "roto", nombre_visible: null, activo: true, last_error: "cuenta no encontrada", last_synced_at: "2026-07-16" }],
    });

    render(<CompetidoresEditor />);
    await waitFor(() => expect(screen.getByText("Sin datos recientes")).toBeInTheDocument());
  });
});
