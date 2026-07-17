import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HeatmapTable from "./HeatmapTable.jsx";

const columns = [
  { key: "nombre", label: "Nombre" },
  { key: "likes", label: "Likes", heatmap: true, align: "right" },
];

describe("HeatmapTable", () => {
  it("filas vacías: muestra el estado vacío, no crashea", () => {
    render(<HeatmapTable columns={columns} rows={[]} emptyMessage="No hay posts" />);
    expect(screen.getByText("No hay posts")).toBeInTheDocument();
  });

  it("una sola fila: no divide por cero, renderiza sin romper", () => {
    const rows = [{ key: "1", nombre: "Post A", likes: 10 }];
    render(<HeatmapTable columns={columns} rows={rows} />);
    expect(screen.getByText("Post A")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("valor null/undefined en una celda no rompe el cálculo de color", () => {
    const rows = [
      { key: "1", nombre: "Post A", likes: 5 },
      { key: "2", nombre: "Post B", likes: null },
      { key: "3", nombre: "Post C", likes: 20 },
    ];
    render(<HeatmapTable columns={columns} rows={rows} />);
    expect(screen.getByText("Post B")).toBeInTheDocument();
    // El valor null se muestra como guion, no como "null" ni rompe el render
    const celdas = screen.getAllByText("—");
    expect(celdas.length).toBeGreaterThan(0);
  });

  it("múltiples filas: la de mayor valor tiene más intensidad de color que la de menor", () => {
    const rows = [
      { key: "1", nombre: "Post bajo", likes: 1 },
      { key: "2", nombre: "Post alto", likes: 100 },
    ];
    render(<HeatmapTable columns={columns} rows={rows} />);
    const filaBaja = screen.getByText("Post bajo").closest("tr");
    const filaAlta = screen.getByText("Post alto").closest("tr");
    const celdaBaja = filaBaja.querySelector("td:last-child");
    const celdaAlta = filaAlta.querySelector("td:last-child");
    expect(celdaBaja.style.backgroundColor).not.toBe(celdaAlta.style.backgroundColor);
  });

  it("usa render() custom cuando se provee", () => {
    const cols = [
      { key: "likes", label: "Likes", render: (value) => `${value} 👍` },
    ];
    render(<HeatmapTable columns={cols} rows={[{ key: "1", likes: 5 }]} />);
    expect(screen.getByText("5 👍")).toBeInTheDocument();
  });
});
