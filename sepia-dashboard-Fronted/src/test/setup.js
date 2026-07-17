import "@testing-library/jest-dom/vitest";

// jsdom no implementa ResizeObserver — recharts (ResponsiveContainer) lo
// necesita para medir el contenedor. Sin este mock, cualquier test que
// renderice un gráfico rompe con "ResizeObserver is not defined".
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock;
}
