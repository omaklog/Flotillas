---

description: "Task list for Feature 013 — Reportes"
---

# Tasks: Reportes

**Input**: Design documents from `/specs/013-reportes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reportes.md,
quickstart.md (all present)

**`/speckit-analyze` (2026-08-19)**: encontró 2 requisitos sin ninguna tarea (FR-004 rechazo de
rango inválido, FR-015 exportación con cero filas — ya cerrados con T010/T008/T009 + T046/T047),
y 3 hallazgos de documentación menores ya corregidos en `spec.md`/`data-model.md`/`contracts/
reportes.md`: el join a `permisos`/`tipos_vehiculo` como dependencia de permiso no listada
(FR-002), el comentario de `FiltrosReporte` incompleto, y los atajos de fecha (FR-003)
sin cita explícita en los filtros de US2-US4 (ya agregada en T026/T034/T041). Ninguno era
CRITICAL — cero conflictos con la constitución.

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada
regla de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS/
permisos por módulo afectado — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md). Las 4 historias son
reportes independientes entre sí en términos de datos (cada uno lee de sus propias tablas de
origen), pero **comparten un único composable** (`app/composables/useReportes.ts`,
plan.md § Structure Decision) y las mismas utilidades de exportación/auditoría — por eso esas
piezas compartidas viven en Foundational, y cada historia solo agrega su propio método al
composable ya creado. Orden sugerido por prioridad de `spec.md`: US1 (Costos de mantenimiento,
P1) → US2 (Combustible, P2) → US3 (Vencimientos, P3) → US4 (Cumplimiento, P4).

**Esquema de base de datos**: sin tablas ni políticas RLS nuevas (spec.md § Decisiones
confirmadas — "no requiere schema nuevo"). El único cambio es de tipo:
`alter type accion_auditoria add value 'exportar'` (data-model.md, research.md R4) — T003-T006.
El permiso `reportes.exportar` y el default `reportes.ver` **ya existen** desde
`schema_02_permisos.sql`/`schema_03_ver_y_defaults.sql`; ninguna tarea de esta feature toca el
catálogo de `modulos`/`acciones_disponibles`.

**Primeras dependencias de exportación de archivos del proyecto**: `exceljs` (research.md R2) y
`jspdf`+`jspdf-autotable` (research.md R3) — T001. Generación 100% en el navegador, sin streaming
de servidor.

**Primer endpoint que escribe en `auditoria` fuera de un trigger**: `useAuditoria.ts` documenta
que `auditoria` "solo se escribe vía triggers, nunca directo desde el cliente" — exportar un
reporte no dispara ningún trigger de negocio (no es un insert/update/delete sobre una tabla de
negocio), así que `server/api/reportes/auditar-exportacion.post.ts` (T007) es la excepción
deliberada y documentada a esa regla, con su propia verificación de sesión + permiso
`reportes.exportar` server-side (research.md R4 — la política RLS de `auditoria` no valida ese
permiso por sí sola, solo `empresa_id`).

**Referencias visuales**: sin pantalla de Stitch dedicada (research.md R5, confirmado listando
las 17 pantallas del proyecto). Se reutilizan, sin ningún valor nuevo: la barra de filtros de
`app/pages/admin/mantenimiento/index.vue`, el patrón de tabla paginada de `TablaCatalogo.vue`
(`docs/design-system.md` línea 174), y la variante de botón secundario ya usada por "Filtros"
(línea 170/180, `variant="outlined"`) para los botones de exportación nuevos
(`mdi-file-excel`/`mdi-file-pdf-box`, ya en `@mdi/font`).

**Lecciones de features anteriores a aplicar desde el inicio**:
- **Agregación en JS, no SQL** (research.md R1, mismo patrón que `useDashboard.ts`): ningún
  reporte usa `rpc()` ni una vista nueva — se trae lo mínimo necesario y se agrega/calcula en el
  composable, incluido el `LAG` de rendimiento de combustible.
- **`ALTER TYPE ... ADD VALUE` en su propia migración**: Postgres no permite usar un valor de
  enum agregado en la misma transacción en la que se agregó — T003 MUST ser una migración propia,
  sin combinar con ningún otro cambio (a diferencia de otras features, aquí no hay nada más que
  agregar de todas formas).
- **El filtro de fechas no restringe el cálculo de rendimiento, solo qué se muestra**
  (Clarifications sesión 2026-08-19, Q1) — es el comportamiento más fácil de implementar mal
  (la forma "obvia" es filtrar antes de calcular el `LAG`); T022 es la prueba que lo protege
  específicamente.
- **`entidad_id` sintético, no nullable**: `auditoria.entidad_id` sigue `not null` sin cambios de
  esquema — T007 genera `crypto.randomUUID()` en el propio endpoint (research.md R4), no hay que
  tocar la columna.
- `supabase gen types typescript --local > archivo` **nunca** con `2>&1` después del `>` —
  corrompe el archivo con el banner del CLI (lección ya documentada en 012, repetida aquí porque
  T006 es exactamente ese comando).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1 = Costos de mantenimiento, US2 =
  Combustible, US3 = Vencimientos, US4 = Cumplimiento — ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend) — sin infraestructura
nueva fuera de ese árbol.

---

## Phase 1: Setup

- [X] T001 Agregar `exceljs`, `jspdf` y `jspdf-autotable` a `package.json` (`yarn add exceljs
      jspdf jspdf-autotable`, research.md R2/R3) — únicas dependencias nuevas de esta feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: El cambio de esquema mínimo, el endpoint de auditoría de exportación, y las
utilidades/composable compartidos por los 4 reportes — nada de las 4 historias puede probarse
hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna tarea de implementación de US1/US2/US3/US4 puede empezar hasta que esta
fase esté completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new reportes_auditoria_exportar`
- [X] T003 En esa migración, como único statement: `alter type accion_auditoria add value
      'exportar';` (research.md R4 — MUST ser una migración propia, ver nota de "Lecciones")
- [X] T004 [P] Copiar el contenido literal de la migración a
      `docs/schema-reference/schema_15_reportes_ajustes.sql` (convención de referencia ya
      establecida por cada feature anterior, ej. `schema_14_alertas_ajustes.sql`)
- [X] T005 Aplicar la migración en local (`supabase migration up`) y verificar manualmente:
      `select enum_range(null::accion_auditoria);` incluye `'exportar'` al final
- [X] T006 [P] Regenerar `app/types/database.types.ts`
      (`supabase gen types typescript --local > app/types/database.types.ts`, **sin** `2>&1`)
- [X] T007 Implementar `server/api/reportes/auditar-exportacion.post.ts`
      (contracts/reportes.md): `serverSupabaseUser` (401 si no hay sesión) →
      `serverSupabaseClient` resuelve el perfil del llamador (`empresa_id`, `rol`, `id`) →
      verifica `reportes.exportar` (`rol==='admin'` siempre pasa; `operario` requiere fila en
      `usuario_permisos` con `modulo_clave='reportes'` y `accion in ('exportar','todos')`, 403 si
      no) → inserta en `auditoria` con `server/utils/supabaseAdmin.ts` (`service_role`):
      `entidad` = `body.reporte`, `entidad_id: crypto.randomUUID()`, `accion: 'exportar'`,
      `valores_despues: { formato: body.formato, filtros: body.filtros }` → responde
      `201 { auditado: true }`
- [X] T008 [P] Implementar `app/utils/exportarExcel.ts`: `exportarExcel(nombreArchivo, hojas)`
      arma un `Workbook` de `exceljs` (una hoja por sección de `hojas`, encabezados en negrita,
      ancho de columna ajustado al contenido), `workbook.xlsx.writeBuffer()` → `Blob` → descarga
      vía `<a>` temporal + `URL.createObjectURL` (research.md R2). MUST aceptar `filas: []` sin
      lanzar — la hoja se genera igual con solo encabezados (+ fila de totales en cero si la
      sección la incluye), no es un caso especial de código (FR-015, `/speckit-analyze` E2)
- [X] T009 [P] Implementar `app/utils/exportarPdf.ts`: `exportarPdf(nombreArchivo, titulo,
      subtitulo, tablas)` arma el PDF con `jspdf` + `jspdf-autotable` (encabezado con `titulo` +
      `subtitulo` con el rango de fechas aplicado, una tabla `autoTable` por sección de
      `tablas`), `doc.save(nombreArchivo)` (research.md R3). Mismo requisito que T008 con
      `filas: []` — `autoTable` ya soporta un arreglo vacío de filas sin configuración especial,
      solo confirmar que no se omite la tabla completa (FR-015, `/speckit-analyze` E2)
- [X] T010 Crear `app/composables/useReportes.ts` con la base compartida (data-model.md §
      Filtros compartidos): tipos `RangoFechas`/`FiltrosReporte`, los resolutores de atajos de
      fecha (`últimos 30 días`/`mes en curso`/`mes anterior` — mismas funciones que
      `useDashboard.ts`, duplicadas aquí si ese archivo no las exporta), `validarRango(rango)`
      (lanza con mensaje claro si `desde > hasta`, FR-004, `/speckit-analyze` E1 — los 4 métodos
      de reporte de las historias siguientes MUST llamarlo como primer paso, contracts/
      reportes.md), y `registrarExportacion({ reporte, formato, filtros })` que llama a `POST
      /api/reportes/auditar-exportacion` (T007) y **no** bloquea ni revierte la descarga si
      falla (solo lo loggea, contracts/reportes.md) — sin ningún método de reporte todavía, cada
      historia agrega el suyo

**Checkpoint**: Fundación lista — US1, US2, US3 y US4 pueden empezar. Nota: las 4 historias
editan el mismo archivo `useReportes.ts` (agregando su propio método) — si se implementan en
paralelo por distintas personas, coordinar esas ediciones o serializarlas por archivo, aunque los
datos/queries de cada historia son independientes entre sí.

---

## Phase 3: User Story 1 - Reporte de costos de mantenimiento (Priority: P1) 🎯 MVP

**Goal**: Un usuario con `reportes.ver` + `mantenimiento.ver` genera el reporte de costos de
mantenimiento (rango de fechas, vehículo opcional), ve el total general, el desglose por tipo
(correctivo/preventivo) y por vehículo, y puede exportarlo a Excel/PDF si tiene `reportes.exportar`.

**Independent Test**: Con órdenes de prueba (correctivas y preventivas, activas y canceladas, de
varios vehículos) dentro y fuera de un rango elegido, generar el reporte y confirmar que los
totales coinciden con la suma esperada de únicamente las órdenes activas del rango.

### Tests for User Story 1

- [X] T011 [P] [US1] Playwright: con órdenes activas de ambos tipos dentro del rango, sin filtro
      de vehículo, el reporte muestra el total general, el total por tipo, y el desglose por
      vehículo con su propio subtotal (US-13.1/AC1, FR-005) en `tests/e2e/reportes.spec.ts`
- [X] T012 [P] [US1] Playwright: filtrar adicionalmente por un vehículo específico muestra
      únicamente los totales de ese vehículo (US-13.1/AC2) en `tests/e2e/reportes.spec.ts`
- [X] T013 [P] [US1] Playwright: una orden con `estado='cancelado'` dentro del rango no se
      incluye en ningún total (US-13.1/AC3, FR-005) en `tests/e2e/reportes.spec.ts`
- [X] T014 [P] [US1] Playwright: un vehículo sin ninguna orden activa en el rango no aparece en
      el desglose por vehículo, aunque tenga órdenes fuera del rango (FR-005, Clarifications
      sesión 2026-08-19) en `tests/e2e/reportes.spec.ts`
- [X] T015 [P] [US1] Playwright: con `reportes.exportar` otorgado, exportar a Excel y a PDF
      descarga un archivo con los mismos totales mostrados en pantalla, y cada exportación genera
      una fila en `auditoria` (`accion='exportar'`, `entidad='reporte_mantenimiento'`,
      `valores_despues.filtros` con el rango/vehículo aplicado) (US-13.1/AC4, FR-013, FR-017) en
      `tests/e2e/reportes.spec.ts`
- [X] T016 [P] [US1] Playwright: un operario sin `reportes.exportar` (no otorgado por defecto) ve
      el reporte pero no tiene disponibles los botones de exportación (US-13.1/AC5, FR-014) en
      `tests/e2e/reportes.spec.ts`

### Implementation for User Story 1

- [X] T017 [US1] Implementar `reporteCostosMantenimiento(filtros)` en
      `app/composables/useReportes.ts` (contracts/reportes.md, data-model.md §
      FilaCostoMantenimiento): llama `validarRango(filtros)` (T010, FR-004) primero, luego trae
      `mantenimientos` `estado='activo'` con `fecha` en `[desde, hasta]` (+ `vehiculo_id` si se
      filtra), agrega en JS por tipo y por vehículo (solo vehículos con ≥1 orden en el resultado)
- [X] T018 [US1] Implementar la sección "Costos de mantenimiento" en
      `app/pages/admin/reportes/index.vue` (y su equivalente `app/pages/operario/reportes/
      index.vue`, mismo componente compartido — ver plan.md § Structure Decision): filtros
      (rango de fechas con atajos, FR-003 + `v-autocomplete` de vehículo), tabla de totales, gateada por
      `tienePermiso('reportes','ver') && tienePermiso('mantenimiento','ver')` (FR-002)
- [X] T019 [US1] Agregar los botones "Exportar a Excel"/"Exportar a PDF" de esta sección
      (`variant="outlined"`, research.md R5), visibles solo con
      `tienePermiso('reportes','exportar')` (FR-014), que llaman `exportarExcel`/`exportarPdf`
      (T008/T009) con los datos ya cargados y luego `registrarExportacion` (T010)

**Checkpoint**: Reporte de costos de mantenimiento funcional y probado de forma independiente —
MVP.

---

## Phase 4: User Story 2 - Reporte de consumo y rendimiento de combustible (Priority: P2)

**Goal**: Un usuario con `reportes.ver` + `combustible.ver` genera el reporte de combustible
(rango de fechas, vehículo opcional), ve litros/galones, costo total y rendimiento real por
vehículo (con "N/D" donde corresponde), y puede exportarlo.

**Independent Test**: Con ≥3 cargas activas consecutivas de un vehículo (odómetro creciente) y
una cancelada intercalada, generar el reporte y confirmar que el rendimiento de cada carga
(salvo la primera de toda la historia del vehículo) coincide con el cálculo esperado.

### Tests for User Story 2

- [X] T020 [P] [US2] Playwright: con ≥3 cargas activas consecutivas y una cancelada intercalada,
      el rendimiento de cada carga (salvo la primera histórica) coincide con
      `(odómetro_actual − odómetro_anterior) ÷ cantidad_actual`, excluyendo la cancelada del
      cálculo (US-13.2/AC1, AC3, FR-007) en `tests/e2e/reportes.spec.ts`
- [X] T021 [P] [US2] Playwright: la primera carga activa de toda la historia de un vehículo (sin
      ninguna anterior real) muestra "N/D", nunca error ni cero, y no distorsiona el promedio del
      periodo (US-13.2/AC2, FR-008) en `tests/e2e/reportes.spec.ts`
- [X] T022 [P] [US2] Playwright — **caso central de la Clarification de esta feature**: con un
      vehículo que tiene una carga activa real *antes* de "desde" (fuera del rango filtrado) y
      otra *dentro* del rango, el reporte calcula el rendimiento de la carga dentro del rango
      usando la de fuera como referencia — NO muestra "N/D" solo por estar en el límite del rango
      (US-13.2/AC3, FR-007, Clarifications sesión 2026-08-19 Q1) en `tests/e2e/reportes.spec.ts`
- [X] T023 [P] [US2] Playwright: sin filtrar por vehículo, se muestra un total general
      (litros/galones + costo) además del desglose por vehículo, solo vehículos con movimientos
      en el rango (US-13.2/AC4, FR-006) en `tests/e2e/reportes.spec.ts`
- [X] T024 [P] [US2] Playwright: exportar a Excel/PDF incluye el desglose por vehículo y el
      rendimiento calculado, incluidas las filas "N/D", y genera su fila de auditoría
      (`entidad='reporte_combustible'`) (US-13.2/AC5, FR-013, FR-017) en `tests/e2e/reportes.spec.ts`

### Implementation for User Story 2

- [X] T025 [US2] Implementar `reporteCombustible(filtros)` en `app/composables/useReportes.ts`
      (contracts/reportes.md, data-model.md § FilaCombustible): llama `validarRango(filtros)`
      (T010, FR-004) primero; luego trae **toda la historia** de `cargas_combustible`
      `estado='activo'` del/los vehículo(s) relevantes (sin filtrar por fecha), ordena por
      `fecha` ascendente por vehículo, calcula el `LAG` en JS (research.md R1), filtra el
      resultado a `[desde, hasta]` para mostrar, agrega totales/promedio solo sobre las filas
      visibles con rendimiento no nulo
- [X] T026 [US2] Implementar la sección "Combustible" en la página de reportes (T018): filtros
      (rango con atajos, FR-003 + vehículo opcional), tabla con columna de rendimiento mostrando
      "N/D" cuando el valor es `null`, gateada por `tienePermiso('reportes','ver') &&
      tienePermiso('combustible','ver')`
- [X] T027 [US2] Agregar los botones de exportación de esta sección (mismo patrón que T019,
      reutilizando T008/T009/T010)

**Checkpoint**: US1 y US2 funcionan de forma independiente.

---

## Phase 5: User Story 3 - Reporte de vencimientos (Priority: P3)

**Goal**: Un usuario con `reportes.ver` + `vehiculos.ver` + `conductores.ver` genera el reporte
de vencimientos (rango de fechas libre, ambos extremos opcionales) con licencias, pólizas y
permisos de vehículo, cada uno con su estado (vigente/por vencer/vencido), y puede exportarlo.

**Independent Test**: Con licencias/pólizas/permisos de prueba con fechas pasadas, próximas y
lejanas, generar el reporte con distintos rangos (ej. "próximos 90 días" y "todo lo ya vencido")
y confirmar que cada uno devuelve exactamente los registros esperados.

### Tests for User Story 3

- [X] T028 [P] [US3] Playwright: con "desde" vacío y "hasta"=hoy, se listan todos los registros
      ya vencidos sin importar qué tan antigua sea su fecha (US-13.3/AC2, FR-009) en
      `tests/e2e/reportes.spec.ts`
- [X] T029 [P] [US3] Playwright: con "hasta" vacío y "desde"=hoy, se listan todos los registros
      que vencen desde hoy en adelante sin límite superior (US-13.3/AC3) en
      `tests/e2e/reportes.spec.ts`
- [X] T030 [P] [US3] Playwright: con un rango desde/hasta específico, se listan únicamente los
      registros cuya fecha de vencimiento cae dentro de ese rango (inclusive), cada uno con su
      estado correcto (umbral de 60 días vs. hoy, no vs. el rango) (US-13.3/AC1, FR-009) en
      `tests/e2e/reportes.spec.ts`
- [X] T031 [P] [US3] Playwright: un vehículo o conductor dado de baja cuyo vencimiento cae dentro
      del rango sigue apareciendo en el reporte (US-13.3/AC4, FR-010) en
      `tests/e2e/reportes.spec.ts`
- [X] T032 [P] [US3] Playwright: exportar a Excel/PDF incluye las 3 categorías (licencias,
      pólizas, permisos) con fecha de vencimiento y estado, y genera su fila de auditoría
      (`entidad='reporte_vencimientos'`) (US-13.3/AC5, FR-013, FR-017) en
      `tests/e2e/reportes.spec.ts`

### Implementation for User Story 3

- [X] T033 [US3] Implementar `reporteVencimientos(rango)` en `app/composables/useReportes.ts`
      (contracts/reportes.md, data-model.md § FilaVencimiento): llama `validarRango(rango)`
      (T010, FR-004) primero; luego 3 queries independientes
      (`conductores.fecha_vencimiento_licencia`, `vehiculos.fecha_vencimiento_poliza`,
      `vehiculo_permisos.fecha_vencimiento` `join` `permisos`/`vehiculos` — este último depende
      de `permisos.ver` vía RLS para el nombre del tipo de permiso, spec.md FR-002 /
      `/speckit-analyze` C1), ninguna filtra por `activo`/`baja` (FR-010), cada una filtrada por
      `fecha_vencimiento` en `[desde, hasta]` (ambos límites opcionales) y unidas en un solo
      arreglo con `tipo` + `estado` calculado (umbral de 60 días vs. hoy)
- [X] T034 [US3] Implementar la sección "Vencimientos" en la página de reportes (T018): solo
      filtro de rango de fechas con atajos (FR-003, sin filtro de vehículo — data-model.md §
      Filtros compartidos, corrección `/speckit-analyze` F1), tabla con columna `tipo`/`estado`,
      gateada por `tienePermiso('reportes','ver') && tienePermiso('vehiculos','ver') &&
      tienePermiso('conductores','ver')`
- [X] T035 [US3] Agregar los botones de exportación de esta sección (mismo patrón que T019)

**Checkpoint**: US1, US2 y US3 funcionan de forma independiente.

---

## Phase 6: User Story 4 - Reporte de cumplimiento (Priority: P4)

**Goal**: Un usuario con `reportes.ver` + `checklist.ver` + `servicios_obligatorios.ver` genera
el reporte de cumplimiento (rango de fechas, sin filtro de vehículo) con, por tipo de vehículo,
el % de checklists aprobados y el % de servicios obligatorios vigentes, y puede exportarlo.

**Independent Test**: Con checklists (`aprobado`/`con_observaciones`) y servicios obligatorios
(vigentes/vencidos) de al menos dos tipos de vehículo, generar el reporte y confirmar que los
porcentajes coinciden con el conteo esperado.

### Tests for User Story 4

- [X] T036 [P] [US4] Playwright: por tipo de vehículo, el % de checklists `aprobado` vs.
      `con_observaciones` del rango coincide con el conteo esperado (US-13.4/AC1, FR-011) en
      `tests/e2e/reportes.spec.ts`
- [X] T037 [P] [US4] Playwright: por tipo de vehículo, el % de servicios obligatorios vigentes
      vs. vencidos refleja el estado **al momento de generar el reporte** — no cambia si se
      reduce el rango de fechas (US-13.4/AC2, FR-012) en `tests/e2e/reportes.spec.ts`
- [X] T038 [P] [US4] Playwright: un tipo de vehículo sin ningún checklist en el rango (o sin
      ningún servicio obligatorio registrado) muestra "Sin datos" en esa celda, nunca "0%"
      (US-13.4/AC3, FR-011, FR-012, Clarifications sesión 2026-08-19) en
      `tests/e2e/reportes.spec.ts`
- [X] T039 [P] [US4] Playwright: exportar a Excel/PDF incluye ambos porcentajes por tipo de
      vehículo, y genera su fila de auditoría (`entidad='reporte_cumplimiento'`) (US-13.4/AC4,
      FR-013, FR-017) en `tests/e2e/reportes.spec.ts`

### Implementation for User Story 4

- [X] T040 [US4] Implementar `reporteCumplimiento(rango)` en `app/composables/useReportes.ts`
      (contracts/reportes.md, data-model.md § FilaCumplimiento): llama `validarRango(rango)`
      (T010, FR-004) primero; luego query de `checklists` filtrada por `fecha` en el rango,
      agrupada por `tipo_vehiculo_id` (`null` si el grupo no tiene filas) — el nombre de cada
      grupo viene de `tipos_vehiculo` (depende de `tipos_vehiculo.ver` vía RLS, spec.md FR-002 /
      `/speckit-analyze` C1); query independiente de `servicios_obligatorios` `join` `vehiculos`
      (para `tipo_vehiculo_id`), **sin** filtrar por el rango (FR-012), agrupada igual con `null`
      si no hay filas
- [X] T041 [US4] Implementar la sección "Cumplimiento" en la página de reportes (T018): solo
      filtro de rango de fechas con atajos (FR-003), tabla/tarjetas por tipo de vehículo con
      ambos porcentajes (mostrando "Sin datos" cuando el valor agregado es `null`), gateada por
      `tienePermiso('reportes','ver') && tienePermiso('checklist','ver') &&
      tienePermiso('servicios_obligatorios','ver')`
- [X] T042 [US4] Agregar los botones de exportación de esta sección (mismo patrón que T019)

**Checkpoint**: Las 4 historias de usuario funcionan de forma independiente — feature completa.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional (constitución §2-§4).

- [X] T043 [P] Playwright, caso positivo Y negativo (permiso de módulo de origen, constitución
      §2/§4): un operario con `reportes.ver` pero sin `ver` en un módulo de origen (ej. sin
      `combustible.ver`) queda bloqueado específicamente del reporte de combustible (no solo con
      datos vacíos), mientras los otros 3 reportes siguen accesibles si tiene `ver` ahí (FR-002,
      Edge Cases) en `tests/e2e/reportes.spec.ts`
- [X] T044 [P] Playwright, caso positivo Y negativo (endpoint de auditoría, constitución §2):
      `POST /api/reportes/auditar-exportacion` llamado directo (sin pasar por la UI) por un
      operario sin `reportes.exportar` responde `403` y no inserta ninguna fila en `auditoria`;
      con el permiso otorgado responde `201` e inserta la fila esperada (FR-017, research.md R4)
      en `tests/e2e/reportes.spec.ts`
- [X] T045 [P] Playwright (multi-tenant, FR-016): un usuario de una empresa distinta nunca ve
      datos de la empresa de prueba en ninguno de los 4 reportes en `tests/e2e/rls.spec.ts`
      **Hallazgo**: la primera versión filtraba por valores numéricos (`costo_total`,
      `odometro`) — "Empresa E2E" es compartida por toda la suite y ya acumula filas de otros
      tests con valores redondos coincidentes, dando un falso positivo de fuga. Corregido para
      filtrar por `vehiculo_id` (uuid único del test), el mismo criterio que `useReportes.ts`
      usa realmente (ninguna consulta filtra por `empresa_id` a mano, todo depende de RLS).
- [X] T046 [P] Playwright (FR-004, `/speckit-analyze` hallazgo E1): en cualquiera de los 4
      reportes, seleccionar "desde" posterior a "hasta" y confirmar que `validarRango` (T010)
      rechaza la combinación con un mensaje claro antes de ejecutar la consulta — sin resultado
      vacío silencioso en `tests/e2e/reportes.spec.ts`
- [X] T047 [P] Playwright (FR-015, `/speckit-analyze` hallazgo E2): con un rango de fechas sin
      ningún dato, exportar a Excel y a PDF y confirmar que ambos archivos se generan
      correctamente (encabezados de columna presentes, totales en cero donde aplique) en vez de
      lanzar un error de exportación en `tests/e2e/reportes.spec.ts`
- [X] T048 Accesibilidad WCAG 2.1 AA (constitución §4): revisar filtros, tablas y botones de
      exportación de las 4 secciones de `app/pages/admin/reportes/index.vue` con teclado real —
      mismo criterio ya aplicado en features anteriores
      **Hallazgos y fixes** (verificado con un script Playwright de navegación real por teclado,
      sin `axe-core` disponible como dependencia — se verificó equivalente a mano):
      1. `PanelReportes.vue`: el subtítulo de la página (`text-medium-emphasis` directo sobre el
         fondo de página, sin tarjeta de por medio) repetía el mismo patrón de contraste 4.45:1
         (por debajo del mínimo AA de 4.5:1) ya encontrado y corregido en Feature 012
         (`PanelPrincipal.vue`). Fix: se quitó `text-medium-emphasis` de ese párrafo, mismo
         criterio que 012.
      2. Navegación por teclado confirmada: `v-tabs` implementa el patrón ARIA tablist estándar
         (Tab entra una vez a la pestaña activa, flechas izquierda/derecha mueven el foco entre
         pestañas, Enter activa) — verificado que Tab→pestaña activa, ArrowRight→siguiente
         pestaña, Enter→cambia el contenido, todo funciona. El foco queda visible (outline sólido
         de 2px) en cada elemento, heredado del `:focus-visible` global de `main.css`, sin CSS
         propio de esta feature que lo oculte.
      3. Las 4 tablas exponen `<table>`/`<thead>`/`<th>` semánticos reales (dentro del wrapper de
         `v-table`, que es donde Vuetify pone el `data-testid`, no en el `<table>` mismo — mismo
         hallazgo ya aplicado en los tests de esta feature para `v-text-field`/`v-autocomplete`).
      4. Los botones de exportación tienen nombre accesible descriptivo por texto visible
         ("Exportar a Excel"/"Exportar a PDF"), sin depender de un ícono solo.
- [X] T049 Ejecutar `quickstart.md` completo de punta a punta (los 6 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
      **Resultado**: los 6 escenarios quedan cubiertos por la suite automatizada de Playwright y
      pasan en verde (`tests/e2e/reportes.spec.ts` 96/96 en los 4 proyectos + `tests/e2e/
      rls.spec.ts` 24/24) — Escenario 1 (mantenimiento)→T011-T016, Escenario 2 (combustible)→
      T020-T024, Escenario 3 (vencimientos)→T028-T032, Escenario 4 (cumplimiento)→T036-T039,
      Escenario 5 (exportación y permisos)→T015/T024/T032/T039 (positivo) + T016/T044 (negativo)
      + T047 (cero filas), Escenario 6 (aislamiento por módulo de origen y multi-tenant)→T043/
      T045. Sin ajustes al contenido de `quickstart.md` — todo lo documentado ahí se cumple tal
      cual. Dos bugs reales encontrados y corregidos durante esta cobertura (no solo hallazgos de
      test): condición de carrera en `cargar()` de las 4 secciones (respuestas de red fuera de
      orden podían pisar un resultado ya filtrado con uno obsoleto — T028 la expuso) y una
      `clave` de prueba con guiones violando el `CHECK` de `permisos` (T032).
- [X] T050 `yarn typecheck` y `yarn lint` en verde sobre el código nuevo de esta feature
      **Hallazgo pre-existente, no introducido por esta feature**: `yarn typecheck`
      (`vue-tsc --noEmit` sin `-p`) es un no-op silencioso en este repo — el `tsconfig.json` raíz
      es de tipo "solution" (`files: []`, solo `references`) y sin `--build`/`-p` explícito no
      revisa nada, siempre reporta éxito. Verificado inyectando un error de tipo deliberado que
      `yarn typecheck` no detectó. Se usó en su lugar `npx vue-tsc --noEmit -p .nuxt/
      tsconfig.app.json` y `-p .nuxt/tsconfig.server.json` (los tsconfig reales generados por
      Nuxt) para validar de verdad el código nuevo de esta feature — limpio, cero errores. Esa
      invocación real expuso además 2 errores de tipo pre-existentes sin relación con Reportes
      (`app/composables/useCatalogo.ts`, `server/api/usuarios/[id]/permisos.put.ts`) — fuera de
      alcance de esta feature, no corregidos aquí. `yarn lint` (ESLint, sí funciona normalmente)
      en verde.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea las 4 historias de usuario.
- **User Story 1 (Phase 3)**: depende de Foundational — sin dependencias de otra historia.
- **User Story 2 (Phase 4)**: depende de Foundational — sin dependencias de otra historia (P2,
  se implementa después de US1 por prioridad, no por necesidad técnica).
- **User Story 3 (Phase 5)**: depende de Foundational — sin dependencias de otra historia.
- **User Story 4 (Phase 6)**: depende de Foundational — sin dependencias de otra historia.
- **Polish (Phase 7)**: depende de que las 4 historias estén completas.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- El método del composable (ej. T017) antes que la sección de página que lo consume (ej. T018).
- La sección de página antes que sus botones de exportación (ej. T018 antes que T019).

### Parallel Opportunities

- T004/T006 (Foundational) en paralelo entre sí y con T007-T010 una vez aplicada la migración
  (T005).
- T008 y T009 (utilidades de exportación) en paralelo entre sí — archivos distintos, sin
  dependencias mutuas.
- Todos los tests de una misma historia marcados [P] pueden correr en paralelo (casos
  independientes dentro del mismo archivo).
- Las 4 historias pueden implementarse en paralelo por distintas personas una vez completa la
  Fundación — con la salvedad ya anotada en el Checkpoint de Foundational: las 4 editan el mismo
  `useReportes.ts`, así que esas ediciones puntuales conviene coordinarlas o serializarlas.
- T043-T047 (Polish) en paralelo entre sí — casos y archivos independientes.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: total general + por tipo + por vehículo, sin filtro"
Task: "Playwright: filtro por vehículo específico"
Task: "Playwright: orden cancelada excluida de los totales"
Task: "Playwright: vehículo sin movimientos no aparece en el desglose"
Task: "Playwright: exportación a Excel/PDF + auditoría"
Task: "Playwright: operario sin permiso exportar no ve los botones"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea las 4 historias)
3. Completar Phase 3: User Story 1 (Costos de mantenimiento)
4. **PARAR y VALIDAR**: probar US1 de forma independiente (quickstart.md Escenario 1)
5. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → Fundación lista (migración, endpoint de auditoría, utilidades de
   exportación, composable base)
2. US1 (Costos de mantenimiento) → probar de forma independiente → MVP
3. US2 (Combustible) → probar de forma independiente → Deploy/Demo
4. US3 (Vencimientos) → probar de forma independiente → Deploy/Demo
5. US4 (Cumplimiento) → probar de forma independiente → feature completa
6. Cada historia agrega valor sin romper las anteriores

### Parallel Team Strategy

Con varias personas: completar Setup + Foundational en conjunto primero (T001-T010, especialmente
la migración T002-T005 y el endpoint T007, que las 4 historias dan por hecho); luego cada persona
toma una historia, coordinando ediciones a `useReportes.ts` (única fuente de conflicto real entre
historias — cada método vive en su propia sección del archivo, sin lógica compartida entre
reportes más allá de los tipos/helpers ya puestos en T010).

---

## Notes

- [P] tareas = archivos distintos o casos independientes, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en el checkpoint para validar cada historia de forma independiente antes de continuar.
- Dado el tamaño de esta feature (50 tareas, primera vez que el proyecto genera archivos
  descargables y primera excepción documentada a "auditoria solo por trigger"), la constitución
  §5 exige revisión humana intermedia al menos cada 5-8 tareas — puntos naturales de pausa:
  después de T007 (endpoint de auditoría, antes de construir sobre él), y al cierre de cada
  Checkpoint de historia (T019, T027, T035, T042).
