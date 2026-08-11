# Quickstart: Mantenimiento (Correctivo y Preventivo)

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado (`supabase start`, `.env` configurado), con la migración nueva de esta
  feature aplicada (`cantidad` en detalles, `motivo_cancelacion`, trigger de inmutabilidad propio,
  triggers de auditoría — `data-model.md`, sección "Extensiones sobre el esquema actual").
  **Importante**: aplicar la migración de Combustible (007) antes que la de esta feature si
  ambas están pendientes en el mismo entorno (data-model.md, nota sobre orden de aplicación).
- Un administrador activo de una empresa de prueba.
- Un vehículo activo (Vehículos, 003), un proveedor activo (Catálogos Base II, 006), y al menos
  un producto de cada tipo relevante — `refaccion`, `llanta`, `servicio`, `consumible` — ya dados
  de alta en esa empresa.
- Un operario activo de esa misma empresa con los permisos por defecto (`ver`+`crear` en
  `mantenimiento`, sin `cancelar`).

## Escenario 1 — Captura con múltiples líneas de distintos tipos (US-1)

1. Como administrador, ir a "Mantenimiento" → "Nueva orden".
2. Seleccionar tipo (correctivo), el vehículo y proveedor de los Prerrequisitos, fecha (hoy).
3. Agregar una línea de tipo Refacción (capturando cantidad), otra de tipo Llanta (marca, medida,
   número de serie, condición, kilometraje) y otra de tipo Servicio (fecha de próximo servicio,
   frecuencia).
4. Capturar costo total y notas. Guardar.
5. **Esperado**: la orden aparece en el listado con "3" en la columna de número de líneas; su
   detalle muestra las 3 líneas con los campos correctos de cada tipo.

## Escenario 2 — Bloqueo de captura sin líneas (US-1, FR-004, SC-002)

1. Repetir el Escenario 1 hasta el paso 2, pero sin agregar ninguna línea.
2. Intentar guardar.
3. **Esperado**: el sistema rechaza antes de guardar, con un mensaje claro; no se crea ningún
   registro.

## Escenario 3 — Factura opcional, con reemplazo posterior (US-1, FR-009, FR-011)

1. Capturar una orden adjuntando una factura (PDF o imagen).
2. **Esperado**: la orden se crea con esa factura asociada, visible en el detalle.
3. Desde el detalle, reemplazar la factura por un archivo distinto.
4. **Esperado**: el detalle muestra la nueva factura como vigente, y el historial conserva la
   versión anterior.

## Escenario 4 — Selectores excluyen inactivos y productos de tipo combustible (US-1, FR-002, FR-004)

1. Dar de baja el vehículo o desactivar el proveedor usados en escenarios anteriores.
2. Abrir "Nueva orden".
3. **Esperado**: ese vehículo/proveedor ya no aparece en su selector.
4. Al agregar una línea, abrir el selector de producto.
5. **Esperado**: ningún producto de tipo combustible aparece como opción.

## Escenario 5 — Listado, filtros, y vehículo dado de baja con historial (US-2, FR-002, FR-012, FR-013)

1. Con varias órdenes ya capturadas (activas y canceladas, de distintos vehículos, tipos,
   proveedores y fechas), aplicar cada filtro por separado (vehículo, tipo, rango de fechas,
   proveedor, estado).
2. **Esperado**: el listado muestra exactamente las órdenes que cumplen cada filtro.
3. Sobre el vehículo dado de baja del Escenario 4 (con órdenes ya capturadas antes de la baja),
   abrir el filtro de vehículo del listado.
4. **Esperado**: ese vehículo no aparece como opción del filtro — pero sus órdenes siguen
   visibles en el listado general sin aplicar ese filtro.

## Escenario 6 — Cancelar una orden (US-3, FR-015, FR-016, FR-017)

1. Como administrador (o un operario con `cancelar` otorgado explícitamente), abrir el detalle de
   una orden activa y usar "Cancelar" **sin** capturar un motivo.
2. **Esperado**: el sistema bloquea la confirmación.
3. Capturar un motivo (hasta 150 caracteres) y confirmar.
4. **Esperado**: la orden queda `cancelado` en el listado, distinguida visualmente de las
   activas.
5. Volver a abrir su detalle.
6. **Esperado**: no existe ninguna acción para reactivarla, editar su motivo, reemplazar su
   factura, ni editar ninguna de sus líneas.

## Escenario 7 — Operario sin permiso `cancelar` (RLS negativo, constitución §4, FR-015, SC-004)

1. Iniciar sesión como el operario de los Prerrequisitos (solo `ver`+`crear` en `mantenimiento`).
2. Confirmar que puede capturar y consultar órdenes, pero que la acción "Cancelar" no aparece en
   el detalle de ninguna orden activa.
3. Confirmar, llamando directo al cliente Supabase del operario (no vía UI), que un `update` de
   `estado` a `cancelado` sobre una orden activa es rechazado por RLS.
4. Otorgar `cancelar` explícitamente a ese operario.
5. **Esperado**: ahora la acción "Cancelar" aparece y funciona igual que para un administrador.

## Notas de validación no funcional

- **Auditoría** (constitución §2): tras cada captura y cancelación, confirmar en
  `public.auditoria` la fila correspondiente sobre `mantenimientos`, con `accion =
  'crear'`/`'cancelar'` (no `'editar'` a secas para la cancelación).
- **Accesibilidad** (constitución §4): el formulario de captura multi-línea y el listado deben
  cumplir WCAG 2.1 AA.
- **Inmutabilidad** (constitución §2, FR-010): confirmar, llamando directo al cliente Supabase, que
  un `update` sobre cualquier columna operativa/financiera de una orden (activa o cancelada)
  distinta de `estado`/`motivo_cancelacion`/`factura_archivo_id` es rechazado por el trigger
  `private.solo_permite_cancelar_mantenimiento()`, y que cualquier `update`/`delete` directo sobre
  una fila de `mantenimiento_detalles` es rechazado por RLS.
