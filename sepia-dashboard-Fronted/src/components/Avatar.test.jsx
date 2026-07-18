import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Avatar from "./Avatar.jsx";

describe("Avatar", () => {
  it("sin fotoUrl: muestra el círculo con la inicial", () => {
    render(<Avatar nombre="Rival A" color="#0ea5e9" />);
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("con fotoUrl: muestra la imagen en vez del círculo", () => {
    render(<Avatar fotoUrl="https://example.com/foto.jpg" nombre="Rival A" color="#0ea5e9" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/foto.jpg");
  });

  it("si la imagen falla al cargar, cae al círculo con inicial", () => {
    render(<Avatar fotoUrl="https://example.com/rota.jpg" nombre="Rival A" color="#0ea5e9" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("nombre vacío no rompe, muestra ?", () => {
    render(<Avatar nombre="" color="#0ea5e9" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
