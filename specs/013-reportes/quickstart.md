# Quickstart: Reportes

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado (`supabase start`), con la migración de esta feature aplicada
  (`alter type accion_auditoria add value 'exportar'` — `data-model.md`).
- Una empresa de prueba con datos que cubran los 4 reportes:
  - Al menos 2 vehículos, cada uno con ≥2 órdenes de mantenimiento activas (una correctiva, una
    preventiva) y una cancelada, en fechas distintas dentro y fuera de un rango de prueba.
  - Un vehículo con ≥3 cargas de combustible activas consecutivas (odómetro creciente) y una
    cancelada intercalada; otro vehículo con una sola carga activa en toda su historia.
  - Licencias de conductor, pólizas de vehículo y permisos de vehículo con fechas de vencimiento
    pasadas, próximas (dentro de 60 días) y lejanas.
  - Checklists (`aprobado` y `con_observaciones`) y servicios obligatorios (vigentes y vencidos)
    de al menos dos tipos de vehículo distintos.
- Un administrador activo de esa empresa, y un operario con los permisos por defecto (`ver` en
  `reportes`, sin `exportar`).

## Escenario 1 — Reporte de costos de mantenimiento (US-13.1)

1. Como administrador, abrir el reporte de costos de mantenimiento con el rango de fechas de
   prueba, sin filtrar por vehículo.
2. **Esperado**: total general, total por tipo (correctivo/preventivo) y desglose por vehículo
   coinciden con la suma manual de las órdenes **activas** del rango; la orden cancelada no
   aparece en ningún total; el desglose por vehículo no incluye vehículos sin movimientos en el
   rango (FR-005).
3. Filtrar por un vehículo específico. **Esperado**: solo sus totales.

## Escenario 2 — Reporte de combustible y rendimiento (US-13.2)

1. Abrir el reporte de combustible para el vehículo con ≥3 cargas activas consecutivas.
2. **Esperado**: el rendimiento de cada carga (salvo la primera de toda su historia) coincide con
   `(odómetro_actual − odómetro_anterior) ÷ cantidad_actual`, excluyendo la cancelada del cálculo
   (no cuenta ni como anterior ni como actual).
3. Repetir con un rango de fechas que **excluya** la primera carga real del vehículo pero incluya
   la segunda. **Esperado**: la segunda carga (ahora la primera fila visible) SÍ muestra un
   rendimiento calculado, usando la carga real anterior fuera del rango como referencia — no
   "N/D" (Clarifications sesión 2026-08-19, Q1).
4. Abrir el reporte para el vehículo con una sola carga en toda su historia. **Esperado**: su
   rendimiento se muestra como "N/D", nunca error ni cero.

## Escenario 3 — Reporte de vencimientos (US-13.3)

1. Generar el reporte con "hasta" = hoy y "desde" vacío.
2. **Esperado**: lista únicamente los registros (licencias/pólizas/permisos) ya vencidos, sin
   importar qué tan antigua sea su fecha.
3. Generar el reporte con "desde" = hoy y "hasta" vacío.
4. **Esperado**: lista todo lo que vence desde hoy en adelante, sin límite superior.
5. Dar de baja un vehículo/conductor cuyo registro cae dentro de un rango probado.
6. **Esperado**: sigue apareciendo en el reporte (histórico, no oculta dados de baja — FR-010).

## Escenario 4 — Reporte de cumplimiento (US-13.4)

1. Generar el reporte para el rango de prueba.
2. **Esperado**: por tipo de vehículo, % de checklists `aprobado` vs. `con_observaciones` del
   rango, y % de servicios obligatorios vigentes vs. vencidos **al momento de generar el
   reporte** (no cambia si se reduce el rango de fechas, solo afecta a los checklists).
3. Probar con un tipo de vehículo sin ningún checklist en el rango.
4. **Esperado**: esa celda muestra "Sin datos", nunca "0%" (Clarifications sesión 2026-08-19).

## Escenario 5 — Exportación y permisos (FR-013 a FR-017)

1. Como administrador, exportar cualquiera de los 4 reportes a Excel y a PDF.
2. **Esperado**: dos archivos descargados, cada uno con los mismos totales/filas mostrados en
   pantalla al momento de exportar (incluyendo filas "N/D"/"Sin datos").
3. Revisar `public.auditoria` (como admin, vía la pantalla de bitácora — Feature 011).
4. **Esperado**: dos filas nuevas, `accion='exportar'`, `entidad` = la clave del reporte
   exportado, `valores_despues` con `{ formato, filtros }` correctos; ninguna fila nueva se creó
   solo por **ver** el reporte en pantalla (contracts/reportes.md).
5. Como el operario de los Prerrequisitos (sin permiso `exportar`), abrir cualquier reporte.
6. **Esperado**: puede ver el reporte, pero los botones "Exportar a Excel"/"Exportar a PDF" no
   están disponibles.
7. Exportar un reporte con cero filas (rango de fechas sin datos).
8. **Esperado**: el archivo se genera igual, con encabezados y totales en cero — no un error.

## Escenario 6 — Aislamiento por permiso de módulo de origen y multi-tenant (FR-002, FR-016, Edge Cases)

1. Quitar `combustible.ver` de un operario que sí tiene `reportes.ver`.
2. **Esperado**: el reporte de combustible queda bloqueado para ese operario (no solo vacío) —
   los otros 3 reportes, si sus módulos de origen sí tienen `ver`, siguen accesibles.
3. Como un usuario de otra empresa, intentar acceder a cualquiera de los 4 reportes.
4. **Esperado**: nunca ve datos de la empresa de prueba, en ningún reporte.

## Notas de validación no funcional

- **Auditoría** (constitución §2, FR-017): ver Escenario 5 — es la única auditoría nueva de esta
  feature; el resto de la feature es de solo lectura y no dispara ningún trigger existente.
- **RLS y permisos** (constitución §2, §4): Escenarios 5 y 6 cubren el caso positivo (admin/
  operario con permiso) y el negativo (operario sin `exportar`, sin `ver` de módulo de origen,
  otra empresa) — igual que exige la constitución para toda tabla con RLS sensible.
- **Rendimiento** (SC-001): generar cualquiera de los 4 reportes con el rango de fechas de prueba
  MUST tomar menos de 10 segundos desde que se entra a la pantalla.
- **Accesibilidad** (constitución §4): filtros y tablas de los 4 reportes deben cumplir
  WCAG 2.1 AA, mismo criterio ya aplicado a los listados existentes (Combustible, Mantenimiento,
  Checklist, Servicios Obligatorios).
