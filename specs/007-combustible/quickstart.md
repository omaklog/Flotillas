# Quickstart: Combustible

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado (`supabase start`, `.env` configurado), con la migración nueva de esta
  feature aplicada (`motivo_cancelacion`, trigger de odómetro, trigger de inmutabilidad propio —
  `data-model.md`, sección "Extensiones sobre el esquema actual").
- Un administrador activo de una empresa de prueba.
- Un vehículo activo (Vehículos, 003), un proveedor activo y un producto de tipo `combustible`
  (Catálogos Base II, 006) ya dados de alta en esa empresa.
- Un operario activo de esa misma empresa con los permisos por defecto (`ver`+`crear` en
  `combustible`, sin `cancelar`).

## Escenario 1 — Captura básica, con costo autocalculado (US-1)

1. Como administrador, ir a "Combustible" → "Nueva carga".
2. Seleccionar el vehículo, proveedor y producto de los Prerrequisitos. Capturar fecha (hoy),
   odómetro, cantidad y costo unitario.
3. **Esperado**: el campo "Costo total" se autocompleta con `cantidad × costo_unitario` sin
   intervención.
4. Guardar sin tocar el costo total.
5. **Esperado**: la carga aparece en el listado como `activo`, con el costo total correcto.

## Escenario 2 — Override manual del costo total, y su expiración (US-1, FR-002)

1. Repetir el Escenario 1 hasta el paso 3, pero antes de guardar sobreescribir manualmente el
   costo total con un valor distinto al autocalculado (p. ej. para reflejar un descuento).
2. Guardar.
3. **Esperado**: la carga se guarda con el valor manual, no el autocalculado.
4. Iniciar una nueva captura; llegar de nuevo al punto de sobreescribir el costo total
   manualmente, pero **sin guardar todavía** — cambiar después la cantidad o el costo unitario.
5. **Esperado**: el costo total vuelve a autocalcularse, descartando el valor manual anterior.

## Escenario 3 — Factura opcional, con reemplazo posterior (US-1, FR-007, FR-009)

1. Capturar una carga adjuntando una factura (PDF o imagen).
2. **Esperado**: la carga se crea con esa factura asociada, visible en el detalle.
3. Desde el detalle, reemplazar la factura por un archivo distinto.
4. **Esperado**: el detalle muestra la nueva factura como vigente, y el historial conserva la
   versión anterior (no la borra).

## Escenario 4 — Validación de odómetro creciente (US-1, FR-003, SC-002)

1. Capturar una primera carga para un vehículo sin cargas previas, con cualquier odómetro (p. ej.
   10000).
2. Intentar capturar una segunda carga para el mismo vehículo con un odómetro menor (p. ej. 9000).
3. **Esperado**: el sistema rechaza antes de guardar, con un mensaje claro; no se crea ningún
   registro.
4. Capturar una segunda carga con el mismo odómetro exacto (10000).
5. **Esperado**: se acepta — la validación rechaza solo valores estrictamente menores.

## Escenario 5 — Selectores excluyen inactivos, y mensaje sin productos de tipo combustible (US-1, FR-004, FR-005)

1. Dar de baja el vehículo o desactivar el proveedor usados en los escenarios anteriores.
2. Abrir "Nueva carga".
3. **Esperado**: ese vehículo/proveedor ya no aparece en su selector.
4. En una empresa sin ningún producto de tipo `combustible` configurado, abrir "Nueva carga".
5. **Esperado**: el sistema muestra un mensaje claro dirigiendo a crear uno primero, no un
   selector vacío sin explicación.

## Escenario 6 — Listado, filtros, y vehículo dado de baja con historial (US-2, FR-004, FR-010, FR-011)

1. Con varias cargas ya capturadas (activas y canceladas, de distintos vehículos, proveedores y
   fechas), aplicar cada filtro por separado (vehículo, rango de fechas, proveedor, estado).
2. **Esperado**: el listado muestra exactamente las cargas que cumplen cada filtro.
3. Sobre el vehículo dado de baja del Escenario 5 (con cargas ya capturadas antes de la baja),
   abrir el filtro de vehículo del listado.
4. **Esperado**: ese vehículo no aparece como opción del filtro — pero sus cargas siguen visibles
   en el listado general sin aplicar ese filtro.

## Escenario 7 — Cancelar una carga (US-3, FR-012, FR-013, FR-014)

1. Como administrador (o un operario con `cancelar` otorgado explícitamente), abrir el detalle de
   una carga activa y usar "Cancelar" **sin** capturar un motivo.
2. **Esperado**: el sistema bloquea la confirmación.
3. Capturar un motivo (hasta 150 caracteres) y confirmar.
4. **Esperado**: la carga queda `cancelado` en el listado, distinguida visualmente de las activas.
5. Volver a abrir su detalle.
6. **Esperado**: no existe ninguna acción para reactivarla, editar su motivo, ni reemplazar su
   factura.

## Escenario 8 — Operario sin permiso `cancelar` (RLS negativo, constitución §4, FR-012, SC-004)

1. Iniciar sesión como el operario de los Prerrequisitos (solo `ver`+`crear` en `combustible`).
2. Confirmar que puede capturar y consultar cargas, pero que la acción "Cancelar" no aparece en
   el detalle de ninguna carga activa.
3. Confirmar, llamando directo al cliente Supabase del operario (no vía UI), que un `update` de
   `estado` a `cancelado` sobre una carga activa es rechazado por RLS.
4. Otorgar `cancelar` explícitamente a ese operario.
5. **Esperado**: ahora la acción "Cancelar" aparece y funciona igual que para un administrador.

## Notas de validación no funcional

- **Auditoría** (constitución §2): tras cada captura y cancelación, confirmar en
  `public.auditoria` la fila correspondiente.
- **Accesibilidad** (constitución §4): el formulario de captura y el listado deben cumplir
  WCAG 2.1 AA — mismo criterio ya aplicado en features anteriores.
- **Inmutabilidad** (constitución §2, FR-008): confirmar, llamando directo al cliente Supabase
  (no vía UI), que un `update` sobre cualquier columna operativa/financiera de una carga
  (`activa` o `cancelada`) distinta de `estado`/`motivo_cancelacion`/`factura_archivo_id` es
  rechazado por el trigger `private.solo_permite_cancelar_combustible()`.
