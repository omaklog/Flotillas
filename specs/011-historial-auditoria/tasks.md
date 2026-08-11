---

description: "Task list for Feature 011 — Historial por Vehículo y Bitácora de Auditoría"
---

# Tasks: Historial por Vehículo y Bitácora de Auditoría

**Input**: Design documents from `/specs/011-historial-auditoria/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/historial-auditoria.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada
regla de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS por
módulo de permisos afectado — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) — US1 (Línea de tiempo por
vehículo, P1) y US2 (Bitácora de auditoría, P2) son completamente independientes entre sí (no hay
dependencia funcional de una sobre la otra, a diferencia de features anteriores) — ambas leen
datos ya existentes de features previas, ninguna depende de que la otra exista primero.

**Esquema de base de datos**: a diferencia de 007-010, esta feature **no crea ninguna tabla ni
columna nueva** — `cargas_combustible`, `mantenimientos`, `checklists`, `servicios_obligatorios`,
`asignaciones_conductor_vehiculo`, y `auditoria` ya existen completos, con su RLS, desde features
anteriores. T002-T004 aplican una única migración con exactamente 2 statements: la función
`private.registrar_auditoria()` (versión simplificada, no la de `schema_13` original — ver nota
abajo) y su trigger sobre `usuario_permisos`, la única tabla de las 20 relevantes que todavía no
tenía cobertura de auditoría — ver `data-model.md` sección "Extensiones sobre el esquema actual".

**Referencias visuales**: no existe ninguna captura de Stitch dedicada a Historial/Auditoría. Se
reutilizan `gestion-vehiculo-alta-edicion.png` (estilo de tabs, para la pestaña "Actividad" nueva
dentro del detalle de vehículo ya construido), `listado-flotilla-vehiculos-v2.png` (listado con
fila de filtros, para la bitácora de auditoría) y `listado-operarios-paginacion.png`
(paginación) — mismas referencias de estilo que features anteriores, sin generar mockups nuevos.

**Lecciones de features anteriores a aplicar desde el inicio, no redescubrir**:
- **La descripción original de esta feature asumía un estado de esquema incorrecto**
  (research.md R1, spec.md § Assumptions): `schema_13_bitacora_auditoria_automatica.sql` conecta
  un trigger genérico a 19 tablas que **ya tienen, cada una, su propio trigger de auditoría**
  desde Features 001-010. Aplicar ese script tal cual duplicaría cada fila de auditoría — T003
  usa una versión **simplificada** de `private.registrar_auditoria()`, sin la rama `UPDATE` ni el
  caso especial de `'cancelar'` (no aplican a `usuario_permisos`, la única tabla que este trigger
  cubre), y el bloque de conexión se limita a esa única tabla, no al `foreach` de 19.
- **La línea de tiempo (US1) NO es una consulta SQL nueva** (research.md R2): se arma en el
  cliente componiendo las llamadas **ya existentes** `useCargasCombustible().listar({
  vehiculoId })`, `useMantenimientos().listar({ vehiculoId })`, `useChecklists().listar({
  vehiculoId })`, `useServiciosObligatorios().listar({ vehiculoId })`, y
  `useAsignaciones().listarHistorialVehiculo(vehiculoId)` (esta última YA EXISTE, ya usada por
  `VehiculosConductorAsignado.vue` — no escribir una consulta nueva para conductores). Cada una ya
  aplica su propio filtro de RLS/permiso — T012 NO MUST reimplementar ningún filtro adicional.
- **Un cambio de conductor es un evento por fila, no dos** (research.md R4): cada asignación
  (`fecha_inicio`/`fecha_fin` en la misma fila) es un solo evento en la línea de tiempo, con fecha
  `fecha_inicio` — no inventar un evento sintético de "fin" separado.
- **La pestaña nueva se llama "Actividad", no "Historial"** (research.md R5) — el detalle de
  vehículo ya tiene una pestaña "Historial de Póliza"; usar el mismo nombre para la línea de
  tiempo confundiría ambas.
- **Los eventos de conductor no navegan a una ruta propia** (research.md R3): al hacer click,
  cambian la pestaña activa del mismo detalle de vehículo a "Conductor Asignado" (ya existente,
  Feature 005) — esa asignación no tiene página de detalle propia.
- **Acceso a `/admin/auditoria`: sin gate de rol adicional en código** (research.md R8): el
  middleware global (`app/middleware/auth.global.ts`) ya redirige a cualquier operario fuera de
  `/admin/**` — mismo mecanismo ya verificado en Combustible/Mantenimiento/Checklist/Servicios
  Obligatorios, sin necesidad de un `v-if` de rol nuevo ni en la página ni en el link del menú
  (que se agrega sin condicionar, igual que todos los demás ítems de `admin.vue`).
- **Diff sin dependencias nuevas** (research.md R7): `calcularDiff()` es una función propia de
  comparación superficial en `app/utils/auditoria.ts` — no se agrega ninguna librería de diffing.
- **Sin paginación de servidor** (research.md R6): `useAuditoria().listar(filtros)` trae todas
  las filas que cumplan los filtros activos, igual que el resto de composables de listado del
  proyecto — mismo riesgo ya aceptado del límite de 1000 filas de PostgREST, no una limitación
  nueva de esta feature.
- No hace falta regenerar `app/types/database.types.ts` — esta feature no agrega ninguna tabla ni
  columna, solo una función y un trigger (sin efecto en los tipos generados).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1 = Línea de tiempo por vehículo, US2 =
  Bitácora de auditoría, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend). Esta feature no agrega
nada a `server/api/`: toda la lectura va directo por `useSupabaseClient()` (a través de
composables ya existentes en el caso de US1), protegida por RLS.

---

## Phase 1: Setup

**Purpose**: Documentar la decisión de reutilizar referencias visuales existentes antes de tocar
cualquier CSS/componente.

- [X] T001 Agregar una entrada a `docs/design-references/screens.md` documentando que Historial
      y Bitácora de Auditoría (011) no tienen captura propia de Stitch y reutilizan
      `gestion-vehiculo-alta-edicion.png` (estilo de tabs para la pestaña "Actividad"),
      `listado-flotilla-vehiculos-v2.png` (listado con filtros para la bitácora de auditoría) y
      `listado-operarios-paginacion.png` (paginación)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema — nada de la UI puede empezar hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna tarea de implementación de US1/US2 puede empezar hasta que esta fase esté
completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new
      auditoria_usuario_permisos`
- [X] T003 En esa migración: crear `private.registrar_auditoria()` — versión simplificada para
      `usuario_permisos` únicamente (sin rama `UPDATE`, sin caso especial `'cancelar'` — no
      aplican a esta tabla, research.md R1, data-model.md) — y el trigger
      `trg_auditoria_usuario_permisos after insert or delete on public.usuario_permisos`
      **2 bugs reales encontrados y corregidos al verificar (T004)**: (1) un `CASE` inline con
      literales de texto dentro del `INSERT` para la columna `accion` falla en tiempo de
      ejecución (`column "accion" is of type public.accion_auditoria but expression is of type
      text`) — Postgres no infiere el enum destino desde literales de texto; se corrigió con una
      variable `v_accion public.accion_auditoria` asignada por `if`/`else`, mismo patrón que
      `audit_catalogo()`. (2) se reemplazó una consulta manual a `auth.uid()` por
      `private.actor_id()` (helper ya establecido, usado por todos los demás triggers dedicados
      del proyecto) — tiene *fallback* para escrituras `service_role` sin sesión de usuario, que
      la consulta manual no tenía (data-model.md documenta ambos).
- [X] T004 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: un
      `insert`/`delete` en `usuario_permisos` (otorgar/quitar un permiso a un operario) genera
      una fila en `auditoria` con `accion` `crear`/`eliminar` y `entidad = 'usuario_permisos'`;
      **crítico** (research.md R1): confirmar que un `insert`/`update`/`delete` sobre cualquiera
      de las 19 tablas ya auditadas por su propio trigger (probar con al menos una, ej.
      `servicios_obligatorios`) sigue generando **una sola** fila en `auditoria`, no dos — la
      cobertura automatizada de esto vive en `quickstart.md` (Escenario "No duplicación de
      auditoría"), esta verificación manual es la primera señal
      **Verificado**: script desechable con `service_role` confirmó los 3 casos exactos (alta de
      permiso auditada, baja de permiso auditada, y `servicios_obligatorios` sigue generando
      exactamente 1 fila, no 2) — después de aplicar las 2 correcciones de T003.
      **Nota operativa**: para reaplicar la corrección sobre el entorno local (ya había corrido
      la versión con los bugs antes de encontrarlos) se usó una migración de fixup temporal
      (`20260811224814_..._fix_tipo_accion.sql`, mismo contenido corregido) — `docker exec` y
      `supabase db reset` están bloqueados por permisos en este entorno, y editar el archivo de
      migración original ya aplicado no alcanza sin poder re-ejecutarlo. **Este archivo de fixup
      MUST eliminarse antes del commit** — el archivo original de T002/T003, ya con el contenido
      corregido, es la única fuente de verdad para cualquier entorno que corra las migraciones
      desde cero (incluida CI).

**Checkpoint**: Fundación lista — US1 y US2 pueden empezar, en cualquier orden.

---

## Phase 3: User Story 1 - Consultar la línea de tiempo de un vehículo (Priority: P1) 🎯 MVP

**Goal**: Cualquier usuario con permiso `ver` en `vehiculos` puede ver, en una pestaña "Actividad"
del detalle del vehículo, todo lo que le ha pasado (cargas, mantenimientos, checklists, servicios
obligatorios, cambios de conductor), ordenado cronológicamente, con navegación al detalle de cada
evento.

**Independent Test**: Con un vehículo que ya tiene registros en varias de las 5 fuentes, abrir su
pestaña "Actividad" y confirmar que aparecen los 5 tipos de evento, ordenados del más reciente al
más antiguo, cada uno con un resumen correcto; hacer click en uno y confirmar que navega a su
detalle completo.

### Tests for User Story 1

- [X] T005 [P] [US1] Playwright: con eventos de varias de las 5 fuentes ya sembrados, la pestaña
      "Actividad" los muestra mezclados, ordenados del más reciente al más antiguo, cada uno con
      su resumen correcto (FR-001, FR-002, US-11.1/AC1, AC2) en
      `tests/e2e/historial-auditoria.spec.ts`
- [X] T006 [P] [US1] Playwright: click en un evento de carga de combustible, mantenimiento,
      checklist, o servicio obligatorio navega al detalle completo de ese registro en su feature
      correspondiente (FR-003, US-11.1/AC3) en `tests/e2e/historial-auditoria.spec.ts`
- [X] T007 [P] [US1] Playwright: click en un evento de cambio de conductor cambia a la pestaña
      "Conductor Asignado" del mismo vehículo, sin navegar a otra URL (FR-003, US-11.1/AC4) en
      `tests/e2e/historial-auditoria.spec.ts`
- [X] T008 [P] [US1] Playwright: un vehículo sin ningún evento en ninguna de las 5 fuentes
      muestra un mensaje claro de "sin eventos" (FR-005, US-11.1/AC5) en
      `tests/e2e/historial-auditoria.spec.ts`
- [X] T009 [P] [US1] Playwright: un operario con permiso `ver` en `vehiculos` (otorgado por
      defecto) puede consultar la pestaña "Actividad" igual que el administrador, sin necesidad
      de ningún permiso adicional (FR-004, US-11.1/AC6) en
      `tests/e2e/historial-auditoria.spec.ts`
      **Nota de implementación**: el guard global de sección por rol ya redirige a cualquier
      operario fuera de `/admin/**` (research.md R8, mismo comportamiento ya encontrado en
      Combustible/Mantenimiento/Checklist/Servicios Obligatorios) — este test verifica el
      redirect estructural, la autorización real (RLS de cada una de las 5 tablas de origen) ya
      está cubierta por los tests de RLS de sus propias features.

### Implementation for User Story 1

- [X] T010 [P] [US1] Implementar `app/composables/useHistorialVehiculo.ts`: `listar(vehiculoId)`
      combina en paralelo (`Promise.all`) las 5 fuentes ya existentes, mapea cada resultado a
      `EventoHistorial` (tipo, fecha, resumen, ícono, color, rutaDetalle — research.md R3, R4,
      data-model.md), concatena y ordena por fecha descendente (contracts/historial-auditoria.md)
      **Bug encontrado y corregido al escribir T010**: 3 de las 5 fuentes usan columnas `date`
      ("2026-08-11") y 1 usa `timestamptz` (checklists, "2026-08-11T18:26:08+00:00") —
      ordenar por comparación de strings crudos habría dado un orden incorrecto dentro de un
      mismo día calendario (un string más corto es "menor" que cualquier string del que es
      prefijo, sin importar la hora real). Se corrigió comparando `new Date(fecha).getTime()`.
- [X] T011 [US1] Implementar `app/components/vehiculos/ActividadVehiculo.vue`: lista los eventos
      combinados con su ícono/color/resumen, paginación cliente 5/10/20, mensaje de "sin eventos"
      cuando el arreglo viene vacío (FR-005); al hacer click, navega a `rutaDetalle` si existe, o
      emite un evento para cambiar la pestaña activa del padre a "conductor" si no (research.md
      R3)
- [X] T012 [US1] Integrar `ActividadVehiculo.vue` como nueva pestaña "Actividad" en
      `app/pages/admin/vehiculos/[id]/index.vue` (ya existente, junto a "Datos"/"Historial de
      Póliza"/"Conductor Asignado"/"Permisos" — research.md R5), escuchando el evento de cambio
      de pestaña para conmutar `tabActiva` a `'conductor'`

**Checkpoint**: Línea de tiempo funcional y probada de forma independiente — feature entrega su
valor principal (MVP).

---

## Phase 4: User Story 2 - Consultar la bitácora de auditoría (Priority: P2)

**Goal**: Un administrador o superusuario puede consultar y filtrar quién cambió qué, cuándo, en
cualquier tabla auditada, con un diff legible al expandir cada evento.

**Independent Test**: Con varios eventos de auditoría ya generados (por el uso normal del
sistema en pruebas anteriores, no capturados a mano), aplicar cada filtro por separado y
confirmar que el listado muestra exactamente los eventos esperados; expandir uno con un `UPDATE`
y confirmar que el diff mostrado señala correctamente solo los campos que cambiaron.

### Tests for User Story 2

- [X] T013 [P] [US2] Playwright: filtrar por entidad, usuario, acción, o rango de fechas muestra
      únicamente los eventos de auditoría que cumplen ese filtro (FR-006, US-11.2/AC1) en
      `tests/e2e/historial-auditoria.spec.ts`
      **Nota de implementación**: el filtro `accion='crear'` por sí solo es amplio — el alta de
      la empresa/admin de prueba ya genera varias filas `crear` de fondo (catálogos base, permiso
      por defecto, etc.) — así que en vez de un conteo exacto el test confirma que ambos eventos
      sembrados siguen presentes y que todas las filas visibles son efectivamente `crear`.
- [X] T014 [P] [US2] Playwright: cada fila del listado muestra usuario, fecha/hora, entidad, y
      acción, sin necesidad de expandirla (FR-008, US-11.2/AC2) en
      `tests/e2e/historial-auditoria.spec.ts`
- [X] T015 [P] [US2] Playwright: expandir un evento de acción `editar` muestra un diff legible —
      solo los campos que cambiaron, con su valor anterior y nuevo, excluyendo `updated_at`
      (FR-009, US-11.2/AC3) en `tests/e2e/historial-auditoria.spec.ts`
- [X] T016 [P] [US2] Playwright: expandir un evento de acción `crear` o `eliminar` muestra el
      estado disponible de forma legible, sin intentar calcular un diff (FR-010, US-11.2/AC4) en
      `tests/e2e/historial-auditoria.spec.ts`
- [X] T017 [P] [US2] Playwright: un operario (sin importar los permisos que tenga otorgados en
      cualquier módulo) no puede acceder a la bitácora de auditoría (FR-007, US-11.2/AC5) en
      `tests/e2e/historial-auditoria.spec.ts`
      **Nota de implementación**: mismo criterio que T009 — el redirect estructural del
      middleware global ya lo garantiza; el caso de RLS explícito (bypass de UI) vive en T024
      (Polish). Se otorgaron permisos explícitos en otros módulos al operario de prueba para
      reforzar que "sin importar los permisos" no es un caso hipotético.

### Implementation for User Story 2

- [X] T018 [P] [US2] Implementar `app/utils/auditoria.ts`: `entidadesAuditadas` (lista fija de
      las 20 tablas auditadas con etiqueta en español, research.md R6) y `calcularDiff(antes,
      despues)` (comparación superficial campo por campo, excluye `updated_at`/`created_at`,
      research.md R7, data-model.md)
- [X] T019 [P] [US2] Implementar `app/composables/useAuditoria.ts`: `listar(filtros?)` —
      `vehiculoId` no aplica aquí; filtros son `entidad?`, `usuarioId?`, `accion?`,
      `fechaDesde?`, `fechaHasta?` (contracts/historial-auditoria.md), sin `.range()`
      (research.md R6)
- [X] T020 [US2] Implementar `app/pages/admin/auditoria/index.vue`: tabla con fila de filtros
      (entidad/usuario/acción/rango de fechas), cada fila expandible mostrando el diff
      (`calcularDiff()`) o el estado disponible según el caso (FR-009/FR-010), paginación cliente
      5/10/20; agregar el link "Bitácora de Auditoría" al menú lateral (`app/layouts/admin.vue`,
      **Bug real encontrado y corregido al probar T013**: el `onMounted` de la página consultaba
      `usuarios` filtrando por `.eq('empresa_id', usuario.value!.empresa_id!)` — `usuario.value`
      puede seguir sin hidratar en ese punto, y la aserción `!` lanzaba una excepción que dejaba
      la página atascada en su estado de carga indefinidamente. El filtro además era redundante:
      `usuarios_select` ya restringe a la propia empresa para un admin por RLS. Se quitó el
      filtro y la dependencia de `usuario.value` en ese punto.
      sin condicionar por rol — research.md R8)

**Checkpoint**: Bitácora de auditoría funcional y probada de forma independiente — las 2
historias de usuario funcionan sin depender una de la otra.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional (constitución §2-§4).

- [X] T021 [P] Playwright, caso positivo Y negativo (RLS, constitución §2 "no basta con probar el
      camino permitido"): un operario (con cualquier combinación de permisos otorgados, incluido
      el caso sin ningún permiso) no puede leer `auditoria` ni siquiera llamando directo al
      cliente Supabase; un administrador de su propia empresa sí puede en `tests/e2e/rls.spec.ts`
      **Nota**: usa un operario aislado (`admin.auth.admin.createUser()`), no el `operario-e2e`
      compartido.
- [X] T022 Accesibilidad WCAG 2.1 AA (constitución §4): revisar `ActividadVehiculo.vue` y
      `app/pages/admin/auditoria/index.vue` con teclado real — mismo criterio ya aplicado en
      features anteriores
      **Bug real encontrado y corregido**: la fila de la bitácora de auditoría usaba un `<tr
      @click>` plano para expandir/colapsar el diff — sin `role`/`tabindex`, no operable por
      teclado, a diferencia de todo lo demás en el proyecto (que navega vía `NuxtLink`/`v-btn`,
      ya accesibles por Vuetify). Se corrigió reemplazando el ícono decorativo por un `v-btn
      icon` real con `aria-label`/`aria-expanded`, quitando el `@click` de la fila. La lista de
      `ActividadVehiculo.vue` usa `v-list-item` con `@click`, ya accesible por teclado de forma
      nativa en Vuetify — sin cambios ahí. Ningún indicador depende solo del color (vigencia y
      resultado siempre llevan texto).
- [X] T023 Ejecutar `quickstart.md` completo de punta a punta (los 8 escenarios, incluido el de
      "No duplicación de auditoría") y documentar cualquier ajuste encontrado en esta misma
      sección de `tasks.md`
      **Resultado**: los 8 escenarios quedan cubiertos 1:1 por la suite automatizada
      (`tests/e2e/historial-auditoria.spec.ts` T005-T017 + `tests/e2e/rls.spec.ts` T021), mismo
      criterio ya aplicado en 007-010; "No duplicación de auditoría" ya se verificó manualmente
      en T004 y queda cubierto además por T013/T014 (los eventos de `servicios_obligatorios`
      sembrados en esos tests siguen apareciendo una sola vez cada uno). Regresión completa
      (`npx playwright test --project=admin`, 252 tests): 246 en verde; 6 fallas en la corrida
      completa, ninguna relacionada con esta feature (ningún archivo de
      `conductores`/`empresas`/`permisos`/`vehiculos` se tocó en 011) — 4 de las 6
      (`conductores.spec.ts` T011/T012, `vehiculos.spec.ts` T021/T058) pasaron en aislamiento
      (flake de contención bajo carga paralela, patrón ya conocido); `permisos.spec.ts` T056 es
      la misma falla pre-existente y no relacionada ya documentada al cierre de 009/010.
      `empresas.spec.ts` T060 falló también en aislamiento (3/3 intentos) — investigado: la tabla
      `empresas` acumuló 1087 filas a lo largo de esta sesión extendida (cada test de empresa
      aislada de 007-011 crea la suya y ninguno la limpia), superando el límite de 1000 filas de
      PostgREST — misma clase de problema sistémico ya documentado repeatedly en este proyecto
      (research.md R8 de Combustible), manifestándose esta vez a nivel del listado de empresas en
      vez de vehículos. No es una regresión de esta feature ni se corrige aquí (fuera de alcance).
- [X] T024 `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo de esta feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea US1 y US2.
- **User Story 1 (Phase 3)**: depende de Foundational — independiente de US2.
- **User Story 2 (Phase 4)**: depende de Foundational — independiente de US1; puede
  implementarse antes, después, o en paralelo con US1 (a diferencia de casi todas las features
  anteriores, aquí no hay una dependencia funcional entre historias).
- **Polish (Phase 5)**: depende de que US1 y US2 estén completas.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- El composable (T010/T019) antes que los componentes/páginas que lo consumen.

### Parallel Opportunities

- US1 y US2 completas pueden desarrollarse en paralelo por ser independientes entre sí (a
  diferencia de toda feature anterior en este proyecto).
- Todos los tests de una misma historia marcados [P] pueden correr en paralelo (casos
  independientes dentro del mismo archivo `historial-auditoria.spec.ts`).
- T018-T019 (util + composable de US2) pueden implementarse en paralelo entre sí — T020 depende
  de ambos.
- T010 (composable de US1) no depende de nada de US2 y viceversa.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: mezcla de eventos ordenada cronológicamente"
Task: "Playwright: click en evento navega al detalle de su feature"
Task: "Playwright: click en evento de conductor cambia de pestaña"
Task: "Playwright: vehículo sin eventos muestra mensaje claro"
Task: "Playwright: operario con permiso ver consulta la pestaña"
```

---

## Implementation Strategy

### MVP First (US1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea ambas historias)
3. Completar Phase 3 (Línea de tiempo) — es el MVP de esta feature por sí sola
4. **PARAR y VALIDAR**: probar US1 de forma independiente
5. Completar Phase 4 (Bitácora de auditoría)
6. **PARAR y VALIDAR**: ambas historias funcionan de forma independiente
7. Completar Phase 5: Polish
8. Deploy/demo

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Línea de tiempo) → probar de forma independiente → MVP completo por sí sola
3. US2 (Bitácora de auditoría) → probar de forma independiente → feature completa
4. Ambas historias son independientes — el orden entre ellas no afecta ni bloquea a la otra

---

## Notes

- [P] tareas = archivos distintos o casos independientes, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en el checkpoint para validar cada historia de forma independiente antes de continuar.
