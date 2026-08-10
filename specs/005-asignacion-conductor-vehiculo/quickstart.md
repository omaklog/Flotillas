# Quickstart: Asignación Conductor-Vehículo

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado igual que en features anteriores (`supabase start`, `.env`
  configurado), con la migración nueva de esta feature aplicada (trigger de auditoría en
  `asignaciones_conductor_vehiculo` — `data-model.md`, sección "Extensiones sobre el esquema
  actual").
- Un administrador activo de una empresa de prueba.
- Al menos 2 vehículos activos (no dados de baja) y 2 conductores activos (no desactivados) ya
  creados en esa empresa (Vehículos 003, Conductores 004).
- Un operario activo de esa misma empresa, sin permiso `'editar'` ni en `vehiculos` ni en
  `conductores` (estado por defecto tras invitarlo — solo `'ver'` en ambos).

## Escenario 1 — Asignar conductor desde el vehículo, y reemplazo automático (US-1, FR-001, FR-002)

1. Como administrador, abrir un vehículo sin conductor asignado → pestaña "Conductor Asignado".
2. **Esperado**: estado vacío, con botón "Asignar conductor".
3. Elegir un conductor de la lista y confirmar.
4. **Esperado**: el conductor queda vigente de inmediato, sin ningún diálogo de confirmación.
5. Elegir "Cambiar conductor" y seleccionar uno distinto.
6. **Esperado**: el nuevo conductor queda vigente; el historial de la pestaña muestra ambos, el
   primero con fecha de fin (hoy) y el segundo como "Activo" — sin ningún diálogo de confirmación
   (reemplazo automático, FR-002).

## Escenario 2 — Advertencia informativa al asignar un conductor ya ocupado (US-1, FR-003)

1. Con el conductor del Escenario 1 ya activo en ese vehículo, ir a un segundo vehículo sin
   conductor y asignarle el mismo conductor.
2. **Esperado**: antes de confirmar, aparece un mensaje informativo listando el vehículo donde ya
   está activo. Confirmar de todas formas.
3. **Esperado**: el conductor queda activo en ambos vehículos en paralelo — no se bloquea.

## Escenario 3 — Asignar vehículo desde el conductor, con confirmación fuerte al pisar a otro (US-2, FR-005, FR-006)

1. Abrir el detalle de un conductor distinto (sin vehículos activos) → pestaña "Vehículos
   Asignados".
2. Usar "Asignar a otro vehículo" y elegir uno de los vehículos ya ocupados en el Escenario 2.
3. **Esperado**: aparece una confirmación explícita indicando a qué conductor se va a reemplazar
   ("¿Deseas reemplazarlo por este conductor?"). Cancelar primero y confirmar que nada cambió;
   repetir y esta vez confirmar.
4. **Esperado**: el vehículo queda con el nuevo conductor; el conductor anterior ya no lo tiene
   entre sus vehículos activos, pero sigue en su historial.

## Escenario 4 — Finalizar una asignación sin reemplazar (US-3, FR-008)

1. Sobre cualquier vehículo con conductor activo, usar "Finalizar asignación" sin elegir un
   reemplazo.
2. **Esperado**: el vehículo queda sin conductor vigente; la asignación aparece cerrada (con fecha
   de fin) en el historial, sin una fila nueva.
3. Ir al listado principal de vehículos.
4. **Esperado**: ese vehículo muestra el indicador de "Sin conductor" (FR-013).

## Escenario 5 — Selectores excluyen inactivos y la opción ya vigente (FR-009, FR-010)

1. Desactivar un conductor (Conductores 004) que tenga vehículos activos.
2. Abrir el selector de "Asignar conductor" en cualquier vehículo.
3. **Esperado**: ese conductor no aparece en la lista.
4. Sobre un vehículo con conductor activo, abrir "Cambiar conductor".
5. **Esperado**: el conductor actualmente asignado no aparece como opción en el selector.

## Escenario 6 — Eliminación de vehículo bloqueada con mensaje específico (FR-012)

1. Intentar eliminar definitivamente un vehículo con una asignación activa.
2. **Esperado**: se rechaza con un mensaje específico ("tiene asignaciones registradas"), no el
   mensaje genérico de dependientes.

## Escenario 7 — Operario de solo lectura (RLS negativo, constitución §4)

1. Iniciar sesión como el operario (sin `'editar'` en `vehiculos` ni en `conductores`).
2. Confirmar que puede ver el conductor asignado de un vehículo y los vehículos asignados de un
   conductor (tiene `'ver'` en ambos módulos).
3. Confirmar, llamando directo al cliente Supabase del operario (no vía UI), que un
   `insert`/`update` contra `asignaciones_conductor_vehiculo` es rechazado por RLS.
4. Otorgarle `'editar'` en el módulo `conductores` únicamente (no en `vehiculos`) y confirmar que
   ahora sí puede asignar/finalizar — valida que cualquiera de los dos módulos alcanza (FR-011).

## Notas de validación no funcional

- **Auditoría** (constitución §2): tras asignar, reemplazar y finalizar, confirmar en
  `public.auditoria` las filas correspondientes (`'crear'` para la nueva asignación, `'editar'`
  para el cierre de la anterior) — research.md R2.
- **Consistencia del índice único** (SC-002): sembrar directo vía `service_role` un intento de
  segunda fila activa para el mismo `vehiculo_id` y confirmar que Postgres lo rechaza.
- **Accesibilidad** (constitución §4): los selectores y diálogos de confirmación deben cumplir
  WCAG 2.1 AA — mismo criterio ya aplicado en Vehículos y Conductores.
