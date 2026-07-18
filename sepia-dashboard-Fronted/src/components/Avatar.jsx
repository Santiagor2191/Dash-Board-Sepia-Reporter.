import { useState } from "react";

// Foto real si hay fotoUrl y carga bien; si no (falta, o la URL de Meta
// venció/rompió), cae al círculo de color con la inicial — nunca un ícono roto.
export default function Avatar({ fotoUrl, nombre, color, size = "sm" }) {
  const [fallo, setFallo] = useState(false);
  const inicial = (nombre || "?").trim().charAt(0).toUpperCase() || "?";

  if (fotoUrl && !fallo) {
    return (
      <img
        src={fotoUrl}
        alt={nombre ? `Foto de perfil de ${nombre}` : "Foto de perfil"}
        className={`avatar-circle ${size}`}
        style={{ objectFit: "cover" }}
        onError={() => setFallo(true)}
      />
    );
  }

  return (
    <span className={`avatar-circle ${size}`} style={{ background: color }}>
      {inicial}
    </span>
  );
}
