# Fase 3 — GitHub Actions: keep-alive y cron del sync

**Duracion estimada**: 1 dia.

**Pre-requisito**: Fases 1 y 2 listas. Render free duerme tras 15 min de inactividad. Decide si quieres aceptar ese cold start o mitigarlo con keep-alive.

**Lo que vas a tener al final**:
- Un workflow de GitHub Actions que hace ping al backend cada 10 minutos (lo mantiene despierto).
- Un workflow separado que dispara el sync horario contra MeLi.
- Sin costo: GitHub Actions free da 2.000 minutos/mes, nuestros 2 workflows consumen ~500.

---

## 3.1 Por que dos workflows separados

| Workflow | Frecuencia | Que hace |
|---|---|---|
| **keep-alive.yml** | Cada 10 min | Hace `GET /` al backend para que no se duerma |
| **sync-meli.yml** | Cada hora | Llama `POST /admin/sync-ahora` para traer ordenes nuevas de MeLi |

Pudimos meterlos en uno solo, pero separados es mas claro y permite apagar uno sin el otro.

> Nota: tu backend ya tiene `node-cron` interno disparando el sync horario. Si Render esta despierto, ese cron corre solo. **El workflow de sync es solo un seguro** por si el cron interno falla o el backend se duerme antes de que dispare.

> Decision recomendada: no actives keep-alive automaticamente el primer dia. Prueba primero con cold start. Si molesta, usa cada 15 minutos o sube Render a Starter. Un keep-alive cada 10 minutos puede consumir casi todo el cupo mensual free de Render.

---

## 3.2 Crear el workflow keep-alive

En tu repo, crear el archivo:

`.github/workflows/keep-alive.yml`

```yaml
name: Keep backend awake

on:
  schedule:
    # Cada 10 min, todos los dias. Cron en UTC.
    - cron: "*/10 * * * *"
  workflow_dispatch:  # Permite dispararlo manualmente desde GitHub

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping backend
        run: |
          curl -fsS -m 70 -o /dev/null -w "HTTP %{http_code} en %{time_total}s\n" \
            https://sepia-backend.onrender.com/ || echo "Ping fallo, pero no fallamos el job"
```

### Por que el `|| echo`
Si el backend tarda mas de la cuenta o esta arrancando (cold start de 30-60s), curl puede fallar. **No queremos** que GitHub nos notifique cada vez que esto pase. El `|| echo` hace que el job termine OK aunque el ping falle.

---

## 3.3 Crear el workflow sync-meli

Necesita autenticacion porque `/admin/sync-ahora` esta protegido por sesion.

### Opcion A — Token de sesion fijo (mas simple)

En tu backend, crear un endpoint adicional `/admin/sync-cron` que acepta un **token secreto** (en lugar de sesion). Ejemplo:

```js
// sepia meli api/src/routes/syncRoutes.js
router.post("/sync-cron", async (req, res) => {
  const provided = req.headers["x-cron-secret"];
  if (!provided || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ ok: false, mensaje: "Secret invalido" });
  }
  try {
    const resultado = await ejecutarSyncConLock({ daysBack: 14, maxOrders: 1000 });
    res.json({ ok: true, resultado });
  } catch (error) {
    res.status(error?.statusCode || 500).json({ ok: false, mensaje: error.message });
  }
});
```

> Te ayudo a meter esto cuando arranquemos la fase.

**En Render**: anade variable de entorno `CRON_SECRET` con un valor aleatorio largo (ej. `openssl rand -hex 32` o usa cualquier generador).

**En GitHub**: 
1. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Nombre: `CRON_SECRET`. Valor: el mismo que pusiste en Render.

### Workflow

`.github/workflows/sync-meli.yml`:

```yaml
name: Sync MeLi orders to DB

on:
  schedule:
    # Cada hora a los 5 minutos (para no chocar con el cron interno del backend que va a los 0)
    - cron: "5 * * * *"
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch sync
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          response=$(curl -fsS -X POST \
            -H "x-cron-secret: $CRON_SECRET" \
            -H "Content-Type: application/json" \
            -w "\n%{http_code}" \
            https://sepia-backend.onrender.com/admin/sync-cron)
          echo "$response"
          status=$(echo "$response" | tail -n1)
          if [ "$status" -ge 400 ]; then
            echo "::error::Sync devolvio HTTP $status"
            exit 1
          fi
```

---

## 3.4 Activar los workflows

1. **Commit y push** los dos archivos `.yml` a `main`.
2. En GitHub, pestana **"Actions"** → ves los workflows listados.
3. Click en cada uno → **"Enable workflow"** si no esta activo.
4. Prueba manualmente: click en **"Run workflow"** → elige `main` → **"Run workflow"**.
5. Ve a la ejecucion y revisa el log. Debe terminar verde.

---

## 3.5 Como verificar que funciona

### keep-alive
Pasa media hora sin entrar al dashboard. Luego entras: debe responder en <1 segundo (no en 30s del cold start). Si tarda mucho, el keep-alive no esta corriendo.

### sync-meli
1. Genera una orden de prueba en MeLi (o espera a la siguiente venta real).
2. Espera a la siguiente hora :05.
3. En tu dashboard → Historico, debe aparecer esa orden.

Tambien puedes ver el log del sync en Render:
```
[sync cron-horario] OK en 4.2s — 12 ordenes, 1 nuevas, 11 actualizadas, 0 errores
```

---

## 3.6 Costos y limites

GitHub Actions free para repos privados: **2.000 minutos/mes**. Nuestro consumo:

| Workflow | Frecuencia | Tiempo por ejecucion | Total/mes |
|---|---|---|---|
| keep-alive | cada 10 min | ~15 segundos | 4.320 ejecuciones × 0.25 min = **1.080 min/mes** |
| sync-meli | cada hora | ~30 segundos | 720 ejecuciones × 0.5 min = **360 min/mes** |
| **TOTAL** | | | **~1.440 min/mes** |

Margen de ~28% por si algun job tarda extra. Si en algun mes te pasas, no cobran — pausan los workflows hasta el siguiente mes.

> Si tu repo es **publico**, GitHub Actions es ilimitado. Pero los secrets siguen funcionando.

Ademas de GitHub Actions, revisa el cupo de Render free. Mantener un backend despierto todo el mes puede consumir casi todas las horas free del workspace. Si el dashboard se vuelve herramienta diaria, Render Starter evita este problema.

---

## 3.7 Si algo sale mal

- **Workflow no se dispara automaticamente**: GitHub a veces tarda hasta 15-30 min en arrancar workflows nuevos. Ten paciencia o disparalos a mano una vez.
- **Sync da 401**: `CRON_SECRET` mal escrito en uno de los dos lados. Cuidado con espacios al final.
- **Cron 'cada 10 min' no es exacto**: GitHub Actions cron es "best effort", puede correr cada 10-15 min. Para keep-alive sirve igual.
- **Consumo de minutos alto**: pasa a `*/15 * * * *` (cada 15 min) o suprime el keep-alive y vives con el cold start ocasional.
- **Render agota horas free**: desactiva keep-alive o sube el backend a Render Starter.

---

## Resumen de Fase 3

- [x] Backend nunca duerme si activaste keep-alive, o aceptas cold start si lo dejaste apagado
- [x] Sync horario robusto (interno + workflow de respaldo)
- [x] Todo automatico, sin abrir tu PC

**Proximo paso**: [Fase 4 — OneDrive API](fase-4-onedrive-api.md).
