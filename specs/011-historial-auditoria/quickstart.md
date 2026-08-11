# Quickstart: Historial por Vehículo y Bitácora de Auditoría

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado (`supabase start`, `.env` configurado), con la migración nueva de esta
  feature aplicada (trigger de auditoría sobre `usuario_permisos` — data-model.md).
- Un administrador activo de una empresa de prueba.
- Un vehículo con al menos: una carga de combustible, un mantenimiento, un checklist, un servicio
  obligatorio, y una asignación de conductor ya capturados (de features anteriores).
- Un operario activo de esa misma empresa con permiso `ver` en `vehiculos` (otorgado por
  defecto).

## Escenario 1 — Línea de tiempo mezclada y ordenada (US-11.1)

1. Como administrador, abrir el detalle del vehículo de los Prerrequisitos → pestaña
   "Actividad".
2. **Esperado**: aparecen los 5 tipos de evento, ordenados del más reciente al más antiguo, cada
   uno con su ícono/color y un resumen de una línea.

## Escenario 2 — Navegación desde un evento (US-11.1, FR-003)

1. En la pestaña "Actividad", hacer click en un evento de carga de combustible.
2. **Esperado**: navega al detalle completo de esa carga en "Combustible".
3. Volver, hacer click en un evento de cambio de conductor.
4. **Esperado**: cambia a la pestaña "Conductor Asignado" del mismo vehículo (no navega a otra
   URL).

## Escenario 3 — Vehículo sin eventos (US-11.1, FR-005)

1. Abrir la pestaña "Actividad" de un vehículo recién creado, sin ningún registro en ninguna de
   las 5 fuentes.
2. **Esperado**: mensaje claro de "sin eventos", no una lista vacía.

## Escenario 4 — Acceso por operario con permiso `ver` (US-11.1, FR-004)

1. Como el operario de los Prerrequisitos, intentar consultar la pestaña "Actividad" del mismo
   vehículo.
2. **Esperado**: el guard de sección por rol ya existente redirige a cualquier operario fuera de
   `/admin/**` (mismo comportamiento que el resto del proyecto mientras no exista un módulo
   `/operario/**` propio) — la autorización real ya la garantiza la RLS de cada una de las 5
   tablas de origen (`tiene_permiso('<módulo>','ver')`), verificada por Playwright con un cliente
   autenticado directo, no por este escenario de UI.

## Escenario 5 — Filtros de la bitácora de auditoría (US-11.2, FR-006)

1. Como administrador, ir a "Bitácora de Auditoría".
2. Aplicar cada filtro por separado: entidad, usuario, acción, rango de fechas.
3. **Esperado**: el listado muestra exactamente los eventos que cumplen cada filtro.

## Escenario 6 — Diff legible al expandir un evento de edición (US-11.2, FR-009)

1. Editar cualquier registro de una feature ya construida (ej. cambiar la fecha de vencimiento de
   un servicio obligatorio).
2. En la bitácora de auditoría, localizar y expandir ese evento (`accion = 'editar'`).
3. **Esperado**: se muestra solo el campo que cambió, con su valor anterior y nuevo — sin
   `updated_at` ni el resto de campos sin cambios.

## Escenario 7 — Creación y eliminación sin diff (US-11.2, FR-010)

1. Registrar un servicio obligatorio nuevo; localizar y expandir su evento `accion = 'crear'`.
2. **Esperado**: se muestra el estado del registro de forma legible, sin intentar un diff.
3. Eliminarlo; localizar y expandir su evento `accion = 'eliminar'`.
4. **Esperado**: mismo criterio, con el estado previo a la eliminación.

## Escenario 8 — Bitácora exclusiva de administrador (US-11.2, FR-007)

1. Como el operario de los Prerrequisitos, intentar navegar a "Bitácora de Auditoría".
2. **Esperado**: redirigido fuera de `/admin/**`, mismo mecanismo que el Escenario 4.

## Notas de validación no funcional

- **Auditoría de `usuario_permisos`** (constitución §2): otorgar o quitar un permiso a un
  operario y confirmar en `public.auditoria` la fila correspondiente (`accion` = `crear`/
  `eliminar`, `entidad = 'usuario_permisos'`).
- **No duplicación de auditoría** (research.md R1): confirmar que un `insert`/`update`/`delete`
  sobre cualquiera de las 19 tablas ya auditadas por su propio trigger sigue generando **una
  sola** fila en `auditoria`, no dos — riesgo específico de esta feature si `schema_13` se
  hubiera aplicado tal cual.
- **Accesibilidad** (constitución §4): la línea de tiempo y la bitácora de auditoría deben cumplir
  WCAG 2.1 AA.
- **RLS** (constitución §2, §4): confirmar, llamando directo al cliente Supabase, que un operario
  no puede leer `auditoria` sin importar los permisos que tenga otorgados en cualquier módulo.
