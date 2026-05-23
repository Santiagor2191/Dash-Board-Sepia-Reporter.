import { useMemo } from "react";

export default function MultiSelectDropdown({
  title, options, open, onToggle, selectedValues,
  searchValue, onSearchChange, onToggleValue, onSelectAll, onClear,
}) {
  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, searchValue]);

  return (
    <div className={`dropdown ${open ? "is-open" : ""}`} data-dropdown-root>
      <button className="dropdown-trigger" onClick={onToggle} type="button" aria-expanded={open}>
        <span>{title}</span>
        <span className="dropdown-meta">{selectedValues.length}</span>
        <span className="caret">&#9662;</span>
      </button>
      {open && (
        <div className="dropdown-menu">
          <input className="dropdown-search" type="search" value={searchValue} onChange={(e) => onSearchChange(e.target.value)} placeholder="Buscar..." />
          <div className="dropdown-actions">
            <button type="button" onClick={onSelectAll}>Todos</button>
            <button type="button" onClick={onClear}>Limpiar</button>
          </div>
          <div className="dropdown-list">
            {filtered.map((option) => (
              <label className="dropdown-item" key={option.value}>
                <input type="checkbox" checked={selectedValues.includes(option.value)} onChange={() => onToggleValue(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
