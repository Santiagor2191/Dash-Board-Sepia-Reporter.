import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CompetidoresEditor from "./CompetidoresEditor.jsx";
import * as api from "../api.js";

vi.mock("../api.js", () => ({
  getCompetidoresSocial: vi.fn(),
  createCompetidorSocial: vi.fn(),
  updateCompetidorSocial: vi.fn(),
  deleteCompetidorSocial: vi.fn(),
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

  it("guardar exitoso con las 2 redes: crea un competidor por plataforma con el mismo nombre", async () => {
    api.getCompetidoresSocial
      .mockResolvedValueOnce({ competidores: [] })
      .mockResolvedValueOnce({
        competidores: [
          { id: 1, plataforma: "instagram", handle: "nuevo_ig", nombre_visible: "Nuevo", activo: true, last_error: null, last_synced_at: null },
          { id: 2, plataforma: "facebook", handle: "nuevo_fb", nombre_visible: "Nuevo", activo: true, last_error: null, last_synced_at: null },
        ],
      });
    api.createCompetidorSocial.mockResolvedValue({ ok: true });

    render(<CompetidoresEditor />);
    await waitFor(() => expect(screen.getByText(/todavía no cargaste/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/nombre del competidor/i), { target: { value: "Nuevo" } });
    fireEvent.change(screen.getByLabelText(/instagram/i), { target: { value: "nuevo_ig" } });
    fireEvent.change(screen.getByLabelText(/facebook/i), { target: { value: "nuevo_fb" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar competidor" }));

    await waitFor(() => expect(screen.getAllByText("Nuevo").length).toBeGreaterThan(0));
    expect(api.createCompetidorSocial).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "nuevo_ig", plataforma: "instagram", nombre_visible: "Nuevo" }),
    );
    expect(api.createCompetidorSocial).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "nuevo_fb", plataforma: "facebook", nombre_visible: "Nuevo" }),
    );
  });

  it("error al guardar: muestra mensaje claro y no pierde lo tipeado", async () => {
    api.getCompetidoresSocial.mockResolvedValue({ competidores: [] });
    api.createCompetidorSocial.mockRejectedValue(new Error("Ya existe ese competidor"));

    render(<CompetidoresEditor />);
    await waitFor(() => expect(screen.getByText(/todavía no cargaste/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/nombre del competidor/i), { target: { value: "Repetido" } });
    fireEvent.change(screen.getByLabelText(/instagram/i), { target: { value: "repetido" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar competidor" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ya existe ese competidor"));
    // Lo tipeado sigue en los inputs, no se perdió
    expect(screen.getByLabelText(/instagram/i)).toHaveValue("repetido");
  });

  it("muestra 'sin datos recientes' cuando el competidor tiene last_error", async () => {
    api.getCompetidoresSocial.mockResolvedValue({
      competidores: [{ id: 2, plataforma: "instagram", handle: "roto", nombre_visible: null, activo: true, last_error: "cuenta no encontrada", last_synced_at: "2026-07-16" }],
    });

    render(<CompetidoresEditor />);
    await waitFor(() => expect(screen.getByText("Sin datos recientes")).toBeInTheDocument());
  });

  it("eliminar: pide confirmación y no borra si se cancela", async () => {
    api.getCompetidoresSocial.mockResolvedValue({
      competidores: [{ id: 3, plataforma: "instagram", handle: "compa", nombre_visible: "Comp A", activo: true, last_error: null, last_synced_at: null }],
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<CompetidoresEditor />);
    await waitFor(() => expect(screen.getByText("Comp A")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(api.deleteCompetidorSocial).not.toHaveBeenCalled();
  });

  it("eliminar: borra y refresca la lista si se confirma", async () => {
    api.getCompetidoresSocial
      .mockResolvedValueOnce({
        competidores: [{ id: 3, plataforma: "instagram", handle: "compa", nombre_visible: "Comp A", activo: true, last_error: null, last_synced_at: null }],
      })
      .mockResolvedValueOnce({ competidores: [] });
    api.deleteCompetidorSocial.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<CompetidoresEditor />);
    await waitFor(() => expect(screen.getByText("Comp A")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(api.deleteCompetidorSocial).toHaveBeenCalledWith(3);
    await waitFor(() => expect(screen.getByText(/todavía no cargaste/i)).toBeInTheDocument());
  });
});
