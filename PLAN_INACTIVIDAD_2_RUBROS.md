# Plan: Inactividad de expedientes en 2 rubros (Dinero + Actualizaciones)

> Última actualización: 2026-07-08 — **TODAS LAS PARTES COMPLETADAS**

## Resumen

Se dividió el cálculo de expedientes inactivos en **2 rubros independientes**:

1. **Dinero** — gastos, servicios profesionales, mensualidades pagadas, comprobantes aprobados.
2. **Actualizaciones** — actualizaciones escritas (solicitudes) y trabajos por hora (casos).

Además, se **agregaron los `casos`** como expedientes propios (además de las solicitudes) y se **enlazaron los pagos a solicitudes Y casos** mediante una nueva columna JSONB en `payment_receipts`.

---

## Modelo de datos final

### Expedientes trackeados

| Tipo | Filtro de inclusión | Tabla |
|---|---|---|
| Solicitud | modalidad activa (mensualidad, pago_unico, etapa, etapa finalizada) Y estado no excluido (finalizado, pagado, cancelado) | `solicitudes` |
| Caso | estado no excluido (finalizado, cancelado) | `casos` |

### Rubro Dinero

| Fuente | Campo fecha | Vinculación | Aplica a |
|---|---|---|---|
| `gastos` | `fecha` | `id_caso` = expediente | Solicitudes + Casos |
| `servicios_profesionales` | `fecha` | `id_solicitud_sheets` / `id_caso` = expediente | Solicitudes + Casos |
| `mensualidad_pagos` | `created_at` | `solicitud_id` = solicitud | Solicitudes |
| `payment_receipts` | `reviewed_at` | expediente ∈ `solicitud_caso_id_pagados` | Solicitudes + Casos |

> **NOTA IMPORTANTE:** `trabajos_por_hora` **NO** alimenta el rubro dinero. Solo alimenta actualizaciones (confirmado por el usuario).

### Rubro Actualizaciones

| Fuente | Campo fecha | Vinculación | Aplica a |
|---|---|---|---|
| `actualizaciones` | `tiempo` | `id_solicitud` = solicitud | Solicitudes |
| `trabajos_por_hora` | `fecha` | `caso_asignado` = caso | Casos |

> Para casos, el tph **es** la actualización ("los tph son las actualizaciones en sí").

### Cálculo de inactividad

- `diasInactivoDinero` = días desde el max de las fuentes de dinero (fallback: `created_at`).
- `diasInactivoActualizacion` = días desde el max de las fuentes de actualización (fallback: `created_at`).
- `diasInactivo` (overall, compat panel) = `min(diasInactivoDinero, diasInactivoActualizacion)` = días desde la última actividad de cualquier tipo.
- Un expediente se incluye si `diasInactivoDinero >= 15` **O** `diasInactivoActualizacion >= 15`.
- Umbral: 15 días para ambos rubros (solicitudes y casos).

### Pago de comprobantes — nueva columna

| Antes | Ahora |
|---|---|
| `payment_receipts.solicitud_id TEXT FK→solicitudes(id)` (vacía, solo admitía 1 solicitud) | `payment_receipts.solicitud_caso_id_pagados JSONB = { "solicitudes": [...], "casos": [...] }` |

Estructura: `{ "solicitudes": ["id1", ...], "casos": ["id2", ...] }`.

Se puebla al **aprobar** un comprobante:
- **Selectivo** (`items_pagados`): resuelve `gastos.id_caso`/`sp.id_caso` (consulta ambas tablas), `tph.caso_asignado` (caso), `mensualidades.solicitudId` (solicitud).
- **Consolidado**: mensualidades del cliente + ítems del mes marcados pagados.
- **Per-solicitud**: `{solicitudes:[id], casos:[]}`.

---

## Avance por partes — TODO COMPLETADO ✅

### Parte A — Migración SQL + código `solicitud_id` → `solicitud_caso_id_pagados` ✅

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `rename_solicitud_id_to_expedientes_pagados.sql` (nuevo) | `ADD COLUMN solicitud_caso_id_pagados JSONB` + índice GIN + `DROP COLUMN solicitud_id` (FK + índice). Sin backfill (estaba vacía). |
| `app/api/upload-comprobante/route.ts` | Insert (l.361) → `{solicitudes:[id], casos:[]}`. Chequeo unicidad per-solicitud (l.181) → `.contains(...)`. Chequeo consolidado (l.208) → `.is('items_pagados', null)`. |
| `app/api/payment-receipts/route.ts` | l.157-160: deriva `solicitudId` de la nueva columna (1 solicitud + 0 casos = per-solicitud; sino consolidado). |
| `DBSTRUCTURE.md` | Schema actualizado. |

**Validación:** SQL ejecutado en Supabase por el usuario. Typecheck limpio.

---

### Parte B — Poblar `solicitud_caso_id_pagados` al aprobar ✅

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `app/api/payment-receipts/route.ts` | Helper `computeExpedientesPagados()` (l.1828): calcula `{solicitudes:[], casos:[]}` según flujo (per-solicitud / selectivo / consolidado). Llamada al poblar (l.1299-1317) antes del return de éxito: `UPDATE payment_receipts SET solicitud_caso_id_pagados = ...`. No bloquea la aprobación si falla. |

**Lógica del helper:**
- **Per-solicitud**: `{solicitudes:[solicitudId], casos:[]}`.
- **Selectivo** (`items_pagados`): `gastos.id_caso`/`sp.id_caso` (resuelve tipo consultando `solicitudes` y `casos`), `tph.caso_asignado` (caso), `mensualidades.solicitudId` (solicitud).
- **Consolidado**: mensualidades del cliente (`solicitudes` modalidad=mensualidad) + `gastos`/`sp`/`tph` del mes (tph por `id_cliente` en usuarios, vía `casos` en empresas).

**Validación:** Typecheck limpio.

---

### Parte C — Refactor `lib/expedientes-inactivos.ts` (2 rubros + casos) ✅

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `lib/expedientes-inactivos.ts` | Reescrito. Nueva interfaz `ExpedienteInactivo` con `tipoExpediente`, `diasInactivoDinero`, `ultimoMovDinero`, `tipoUltimoMovDinero`, `diasInactivoActualizacion`, `ultimoMovActualizacion`, `tipoUltimoMovActualizacion` (mantiene compat `diasInactivo`/`ultimoMovimiento`). Nuevas funciones puras: `construirMapaUltimoMovDinero` (sin tph), `construirMapaUltimoMovActualizacion`, `expandReceiptsToTuples`, `filtrarCasosActivos`, `estaCasoExcluido`. `ESTADOS_EXCLUIDOS_CASOS = ['finalizado','cancelado']`. `obtenerExpedientesInactivos` consulta `solicitudes` + `casos` + batch paralelo (tph, receipts, mensualidad_pagos, etc.). `aplicarFiltrosUi` con filtro `'caso'`. |
| `lib/expedientes-inactivos.test.ts` | Tests actualizados: 47 tests pasan. Nuevos tests para `estaCasoExcluido`, `filtrarCasosActivos`, `construirMapaUltimoMovDinero` (verifica que tph NO alimenta dinero), `construirMapaUltimoMovActualizacion`, `expandReceiptsToTuples`, `construirListaInactivos` (con casos). |
| `app/api/expedientes-inactivos/route.ts` | Touch trivial para forzar recompilación del dev server. |

**Ajuste aplicado (tph solo en actualizaciones):**
- `construirMapaUltimoMovDinero` no recibe `trabajosPorHora` — solo gastos + sp + mensualidad_pagos + receipts.
- La llamada en `obtenerExpedientesInactivos` pasa tph solo a `construirMapaUltimoMovActualizacion`.
- Los casos que solo tienen tph tendrán `ultimoMovDinero = null` → `diasInactivoDinero` cae al fallback `created_at`. Un caso con tph reciente aparecerá como **inactivo por dinero** (si `created_at` es viejo) pero **activo en actualizaciones**.

**Validación:** 47 + 13 tests verdes. Typecheck limpio. Endpoint en vivo: caso→91, mensualidad→8, etapa→12, all→111.

---

### Parte D — Correo del notify con 2 secciones (Dinero / Actualizaciones) ✅

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `app/api/expedientes-inactivos/notify/route.ts` | `buildInactivityEmail()` reescrito con 2 secciones: 💰 **Desactualizados por dinero** (`diasInactivoDinero >= 15`) y 📝 **Desactualizados por actualizaciones** (`diasInactivoActualizacion >= 15`). Un expediente puede aparecer en ambas. Cada sección: tabla HTML con Cliente, Título, Expediente, Tipo (badge Solicitud/Caso), Modalidad, Días (badge color), Último movimiento, Tipo mov. Texto plano con ambas secciones etiquetadas. Subtítulo: `Dinero: N | Actualizaciones: M`. Tracking unificado `tipo='inactividad_15d'`. |
| `tests/expedientes-inactivos-notify.test.ts` | `buildExpediente` actualizado con campos de ambos rubros + `tipoExpediente`. Test "no reenvía" actualizado: verifica las 2 secciones en el texto y badges por rubro. |

**Validación:** 13 tests verdes. Typecheck limpio. Correo preview enviado en vivo (111 expedientes, resendId confirmado).

---

### Parte E — Panel /dev con columnas por rubro ✅

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `app/dev/page.tsx` | Interfaz `ExpedienteInactivo` (l.308) actualizada con campos de ambos rubros + `tipoExpediente` + `expediente`. Estado `filtroExpModalidad` (l.495) incluye `'caso'`. Dropdown (l.4519) con opción "Casos (por hora)". Tabla (l.4570+) reescrita con columnas: Cliente, Título, Tipo (badge Solicitud/Caso), Modalidad, 💰 Días Dinero (badge + fecha/tipo), 📝 Días Actualización (badge + fecha/tipo), Último Pago. |

**Validación:** Typecheck limpio. Endpoint con filtro `caso` devuelve 91 casos con ambos rubros separados.

---

### Parte F — Tests + lint finales ✅

**Validación completa:**
- **211 tests** pasan (10 archivos).
- **Typecheck** limpio (`tsc --noEmit`).
- **Lint**: solo errores preexistentes `no-explicit-any` (mismo patrón del codebase). Sin errores nuevos.
- **Smoke tests en vivo**: endpoint GET con filtros (caso→91, all→111), correo preview enviado (2 secciones, resendId confirmado).

---

## Queries SQL de utilidad (solo lectura)

### Casos inactivos divididos por rubro

```sql
SELECT
  c.id AS caso_id,
  c.nombre AS caso_nombre,
  c.estado,
  c.expediente,
  c.id_cliente,
  COALESCE(u.nombre, em.nombre, 'Sin cliente') AS cliente_nombre,
  d.fecha_dinero AS ultimo_mov_dinero,
  d.tipo_dinero,
  d.detalle_dinero,
  CASE
    WHEN d.fecha_dinero IS NULL THEN NULL
    ELSE (CURRENT_DATE - d.fecha_dinero::date)
  END AS dias_desde_dinero,
  CASE
    WHEN d.fecha_dinero IS NULL THEN 'inactivo - nunca ha tenido movimiento de dinero'
    WHEN (CURRENT_DATE - d.fecha_dinero::date) >= 15 THEN 'inactivo por dinero (15+ dias sin gasto/servicio)'
    ELSE 'al dia en dinero'
  END AS estado_dinero,
  a.fecha_actualizacion AS ultimo_mov_actualizacion,
  a.detalle_actualizacion,
  CASE
    WHEN a.fecha_actualizacion IS NULL THEN NULL
    ELSE (CURRENT_DATE - a.fecha_actualizacion::date)
  END AS dias_desde_actualizacion,
  CASE
    WHEN a.fecha_actualizacion IS NULL THEN 'inactivo - nunca ha sido actualizado'
    WHEN (CURRENT_DATE - a.fecha_actualizacion::date) >= 15 THEN 'inactivo por actualizacion (15+ dias sin tph)'
    ELSE 'al dia en actualizaciones'
  END AS estado_actualizacion
FROM public.casos c
LEFT JOIN public.usuarios u ON u.id = c.id_cliente
LEFT JOIN public.empresas em ON em.id = c.id_cliente
LEFT JOIN LATERAL (
  SELECT fecha_dinero, tipo_dinero, detalle_dinero
  FROM (
    SELECT g.fecha AS fecha_dinero, 'Gasto' AS tipo_dinero, COALESCE(g.producto, '') AS detalle_dinero
    FROM public.gastos g
    WHERE g.id_caso = c.id AND g.fecha IS NOT NULL
    UNION ALL
    SELECT sp.fecha, 'Servicio Profesional', COALESCE(ls.titulo, '(servicio sin titulo)')
    FROM public.servicios_profesionales sp
    LEFT JOIN public.lista_servicios ls ON ls.id = sp.id_servicio
    WHERE sp.id_caso = c.id AND sp.fecha IS NOT NULL
  ) mov_dinero
  ORDER BY fecha_dinero DESC
  LIMIT 1
) d ON true
LEFT JOIN LATERAL (
  SELECT fecha_actualizacion, detalle_actualizacion
  FROM (
    SELECT t.fecha AS fecha_actualizacion, COALESCE(t.titulo, '') AS detalle_actualizacion
    FROM public.trabajos_por_hora t
    WHERE t.caso_asignado = c.id AND t.fecha IS NOT NULL
  ) mov_act
  ORDER BY fecha_actualizacion DESC
  LIMIT 1
) a ON true
WHERE
  (d.fecha_dinero IS NULL OR (CURRENT_DATE - d.fecha_dinero::date) >= 15)
  OR (a.fecha_actualizacion IS NULL OR (CURRENT_DATE - a.fecha_actualizacion::date) >= 15)
ORDER BY
  COALESCE(
    LEAST(
      CASE WHEN d.fecha_dinero IS NULL THEN 9999 ELSE (CURRENT_DATE - d.fecha_dinero::date) END,
      CASE WHEN a.fecha_actualizacion IS NULL THEN 9999 ELSE (CURRENT_DATE - a.fecha_actualizacion::date) END
    )
  ) DESC;
```

---

## Hallazgos de análisis de datos (casos)

### Distribución de los 97 casos

- 96 "En Proceso", 1 "Finalizado".
- 91 casos inactivos (≥15d sin movimiento en algún rubro), 10 activos (<15d).
- Concentración: MATADERO DEL VALLE 37, SAXE 14, HAVAS 12 (63 de 96 en 3 clientes).
- tph por caso: 10 sin tph, 23 one-off (1 tph), 64 con ≥2 tph.
- 0 tph huérfanos (caso_asignado siempre existe en casos).
- 0 overlap caso/solicitud por expediente.

### Inconsistencias de datos (no de código)

1. **Campo `estado` inútil**: 96/97 "En Proceso". El equipo no marca casos como finalizados → backlog histórico entero aparece como inactivo.
2. **23 casos one-off**: diligencias puntuales ya terminadas pero no marcadas Finalizadas.
3. **2 casos fantasmas**: `fcc74c96` "Juicio de Arlene", `e22e4e0c` "Conciliación de Karina" (Tenería Pirro, 0 movimientos).
4. **1 duplicado**: "Brayan Hudiel" ×2 para MATADERO (`6f6e3b59`, `d8439d24`).
5. **Artefacto de sync**: `casos.created_at` = fecha de sync (no real). Múltiples casos comparten el mismo timestamp exacto. Los tph pueden tener `fecha` anterior a `casos.created_at` (el caso existía antes de entrar a la BD).

### Decisiones del usuario

- Mantener todos los casos (no excluir one-off ni sin-movimiento).
- Umbral de 15 días para casos (igual que solicitudes).
- tph solo en actualizaciones (no en dinero) para casos.
- Excluir casos con estado "Finalizado" o "Cancelado".

---

## Archivos modificados (lista completa)

| Archivo | Partes |
|---|---|
| `rename_solicitud_id_to_expedientes_pagados.sql` (nuevo) | A |
| `app/api/upload-comprobante/route.ts` | A |
| `app/api/payment-receipts/route.ts` | A, B |
| `DBSTRUCTURE.md` | A |
| `lib/expedientes-inactivos.ts` | C |
| `lib/expedientes-inactivos.test.ts` | C |
| `app/api/expedientes-inactivos/route.ts` | C |
| `app/api/expedientes-inactivos/notify/route.ts` | D |
| `tests/expedientes-inactivos-notify.test.ts` | D |
| `app/dev/page.tsx` | E |
| `PLAN_INACTIVIDAD_2_RUBROS.md` (este archivo) | — |
