# Quickstart: Checklist de Aditamentos y Revisión de Seguridad

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado (`supabase start`, `.env` configurado), con la migración nueva de esta
  feature aplicada (`checklist_item_plantillas`, `conductor_id` en `checklists`,
  `es_critico`/`plantilla_item_id` en `checklist_items`, triggers de auditoría —
  `data-model.md`, sección "Extensiones sobre el esquema actual").
- Un administrador activo de una empresa de prueba, con al menos un tipo de vehículo (Catálogos
  Base, 002) y un vehículo activo de ese tipo (Vehículos, 003).
- Un operario activo de esa misma empresa con los permisos por defecto (`ver`+`crear` en
  `checklist`, sin `editar`).

## Escenario 1 — Alta de ítems de plantilla para un tipo de vehículo (US-1)

1. Como administrador, ir a "Checklist" → "Plantilla".
2. Seleccionar el tipo de vehículo de los Prerrequisitos.
3. Agregar 3 ítems (ej. "Extintor", "Botiquín", "Triángulos"), con distinto orden; marcar uno
   como "es crítico".
4. **Esperado**: los 3 aparecen en el listado, ordenados como se capturó.

## Escenario 2 — Editar y eliminar un ítem sin afectar checklists ya capturados (US-1)

1. Sobre uno de los ítems del Escenario 1, capturar un checklist completo (ver Escenario 3) que
   lo incluya.
2. Editar ese ítem (cambiar nombre).
3. **Esperado**: el checklist ya capturado conserva el nombre anterior en su detalle; futuras
   capturas usan el nombre nuevo.
4. Eliminar ese ítem de la plantilla.
5. **Esperado**: desaparece de la plantilla (futuras capturas no lo incluyen), pero el checklist
   ya capturado sigue mostrando su copia completa, sin errores.

## Escenario 3 — Capturar un checklist, con conductor autocompletado (US-2)

1. Asignar un conductor activo al vehículo de los Prerrequisitos (Asignación
   Conductor-Vehículo, 005).
2. Como administrador u operario, ir a "Checklist" → "Nuevo".
3. Seleccionar el vehículo.
4. **Esperado**: la plantilla de ítems de su tipo se carga automáticamente, y el campo de
   conductor aparece precargado con el conductor asignado.
5. Marcar cada ítem como cumple, elegir resultado "Aprobado", y guardar.
6. **Esperado**: el checklist se crea con todos sus ítems y queda visible en su propio detalle.

## Escenario 4 — Observaciones obligatorias si un ítem no cumple (US-2, FR-007)

1. Repetir el Escenario 3, pero marcar un ítem como "No cumple" sin capturar observaciones.
2. Intentar guardar.
3. **Esperado**: el sistema bloquea el envío con un mensaje claro, sin crear ningún registro.
4. Capturar observaciones para ese ítem y guardar.
5. **Esperado**: procede sin problema.

## Escenario 5 — Bloqueo si el tipo de vehículo no tiene plantilla configurada (US-2, FR-004)

1. Dar de alta un vehículo de un tipo de vehículo **sin** ningún ítem de plantilla configurado.
2. Ir a "Checklist" → "Nuevo" y seleccionarlo.
3. **Esperado**: el sistema bloquea la captura con un mensaje claro dirigiendo a configurar la
   plantilla primero (Escenario 1).

## Escenario 6 — Listado, filtros, e inmutabilidad (US-3, FR-010, FR-011)

1. Con varios checklists ya capturados (de distintos vehículos, conductores, fechas y
   resultados), aplicar cada filtro por separado (vehículo, rango de fechas, resultado,
   conductor).
2. **Esperado**: el listado muestra exactamente los checklists que cumplen cada filtro.
3. Abrir el detalle de uno.
4. **Esperado**: no existe ninguna acción de edición, cancelación ni borrado — solo lectura.

## Escenario 7 — Vehículo sin conductor asignado (US-2, FR-005)

1. Capturar un checklist para un vehículo sin ninguna asignación de conductor activa.
2. **Esperado**: el campo de conductor aparece vacío; el usuario puede seleccionar uno
   manualmente antes de guardar, o dejarlo vacío si corresponde.

## Notas de validación no funcional

- **Auditoría** (constitución §2): tras cada alta/edición/eliminación de un ítem de plantilla, y
  tras cada captura de checklist, confirmar en `public.auditoria` la fila correspondiente.
- **Accesibilidad** (constitución §4): el formulario de captura y el listado deben cumplir
  WCAG 2.1 AA.
- **Inmutabilidad** (constitución §2, FR-010): confirmar, llamando directo al cliente Supabase
  (no vía UI), que cualquier `update`/`delete` sobre un `checklist` o un `checklist_item` ya
  insertado es rechazado por RLS (`using (false)`, incondicional para cualquier rol).
