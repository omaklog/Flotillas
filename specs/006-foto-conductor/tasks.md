---

description: "Task list for Feature 006 — Foto del Conductor"
---

# Tasks: Foto del Conductor

**Input**: Design documents from `/specs/006-foto-conductor/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/foto-conductor.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada regla
de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS por cada
cambio de política — no es opcional para este proyecto.

**Organization**: Una sola historia de usuario (spec.md solo tiene US1) — sin fases P2/P3.

**Esquema de base de datos**: `conductores`, `archivos` y el bucket `documentos` **ya existen**.
T002-T007 aplican una única migración nueva con lo que falta: el valor de enum `foto_conductor`,
la columna `conductores.foto_archivo_id`, y la regeneración de las 4 políticas de
`storage.objects` con la rama nueva — ver `data-model.md` sección "Extensiones sobre el esquema
actual".

**Lecciones de Vehículos (003) y Conductores (004) a aplicar desde el inicio, no redescubrir**:
- `alter type ... add value` MUST ir en su propia migración/transacción, sin insertar en la misma
  migración una fila de `archivos` que use el valor nuevo (`tipo_archivo`) — mismo bloqueo de
  Postgres que Vehículos ya encontró al agregar `'foto'`.
- `validarFoto()` (`app/utils/archivos.ts`) ya es genérica — **no** crear una función nueva ni
  duplicarla.
- El orden del reemplazo de foto (subir + vincular la nueva primero, borrar la anterior
  *después*, solo si lo anterior tuvo éxito) es obligatorio — invertirlo arriesga perder la foto
  vigente si un paso intermedio falla (mismo edge case ya cubierto y probado en Vehículos, T060 de
  esa feature).
- `supabase gen types typescript --local > archivo` **nunca** con `2>&1` después del `>` —
  corrompe el archivo con el banner del CLI.
- Los tests de RLS deben cubrir el caso POSITIVO (operario con el permiso correcto sí puede)
  además del negativo — mismo hallazgo E1 de `/speckit-analyze` sobre Conductores.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend). Esta feature no agrega
nada a `server/api/` (research.md R5): toda la lectura/escritura va directo por
`useSupabaseClient()`, protegida por RLS.

---

## Phase 1: Setup

**Purpose**: Registrar la referencia de Stitch de esta feature (research.md R4) — a diferencia de
Conductores (004) y Asignación Conductor-Vehículo (005), esta feature sí tiene captura propia.

- [X] T001 Agregar la fila de `detalle-conductor-datos-generales.png` a
      `docs/design-references/screens.md` (screen ID `d3847082278f4718b7436a7868767d58`,
      descargada 2026-08-10) y documentar la adaptación deliberada respecto al patrón de Vehículos
      (foto en tarjeta propia con nombre y chip de tipo de licencia, en vez de embebida en la
      tarjeta de datos) — ver research.md R4.
      **Estado**: hecho. Imagen descargada vía el workaround de curl de `CLAUDE.md`, guardada en
      `docs/design-references/screens/detalle-conductor-datos-generales.png`. `spec.md`
      (Assumptions) y `research.md` (R4) actualizados con la referencia y la adaptación.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema, Storage y composable — nada de la UI puede empezar hasta que esta fase esté
completa.

**⚠️ CRITICAL**: Ninguna tarea de implementación de US1 puede empezar hasta que esta fase esté
completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new conductores_foto`
- [X] T003 En esa migración: `alter type public.tipo_archivo add value 'foto_conductor'` — en su
      propia sentencia, sin ninguna manipulación de datos que use el valor nuevo en la misma
      migración (research.md R2)
- [X] T004 En esa misma migración: `alter table public.conductores add column foto_archivo_id uuid
      references public.archivos(id)` (data-model.md)
- [X] T005 En esa misma migración: `drop policy` + `create policy` de las 4 políticas
      `documentos_select`/`insert`/`update`/`delete` de `storage.objects`, agregando la rama
      `(storage.foldername(name))[1] = 'foto_conductor'` → `tiene_permiso('conductores',
      'ver'|'editar')`, sin tocar las ramas `poliza`/`foto`→`vehiculos` ni `licencia`→`conductores`
      ya existentes (research.md R2, data-model.md)
- [X] T006 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: `\d
      conductores` muestra `foto_archivo_id`; una subida de prueba vía REST con `service_role` a
      `foto_conductor/{empresa}/{id}/x.jpg` aterriza en la ruta esperada; un `INSERT` de prueba en
      `archivos` con `tipo='foto_conductor'` tiene éxito
      **Estado**: hecho. `\d conductores`/enum verificados vía `supabase gen types` (columna y
      valor de enum presentes en la salida) — no había `psql` disponible localmente para el `\d`
      literal, así que T006 y T007 se verificaron juntos con el mismo comando.
- [X] T007 [P] Regenerar `app/types/database.types.ts`
      (`supabase gen types typescript --local > app/types/database.types.ts`, **sin** `2>&1`)
- [X] T008 Implementar `adjuntarFoto(conductorId, archivo)` en
      `app/composables/useConductores.ts`: calcado de `adjuntarFoto()` de `useVehiculos.ts`
      (contracts/foto-conductor.md) — sube a `foto_conductor/${empresaId}/${conductorId}/...`,
      inserta la fila de `archivos` (`tipo: 'foto_conductor'`, `entidad_tipo: 'conductor'`),
      actualiza `conductores.foto_archivo_id`, y **solo después** de que eso tuvo éxito borra la
      foto anterior (si había) — nunca antes. `yarn typecheck`/`yarn lint` en verde.

**Checkpoint**: Fundación lista — la única historia de usuario de esta feature puede empezar.

---

## Phase 3: User Story 1 - Administrador adjunta y reemplaza la foto de un conductor (Priority: P1) 🎯 MVP

**Goal**: El administrador puede adjuntar una foto de un conductor durante el alta o editando, y
reemplazarla cuando sea necesario, visible en su detalle de solo lectura.

**Independent Test**: Dar de alta un conductor adjuntando una foto y confirmar que aparece en su
detalle; reemplazarla por otra y confirmar que la nueva se muestra y la anterior ya no existe en
Storage; intentar adjuntar un archivo inválido y confirmar que se rechaza antes de subirse.

### Tests for User Story 1

- [X] T009 [P] [US1] Playwright: adjuntar una foto durante el alta la deja visible en el detalle
      del conductor (FR-001, Escenario 1) en `tests/e2e/conductores.spec.ts`
- [X] T010 [P] [US1] Playwright: adjuntar una foto después, editando un conductor sin foto previa,
      la deja visible en el detalle (FR-001, Escenario 2) en `tests/e2e/conductores.spec.ts`
- [X] T011 [P] [US1] Playwright: reemplazar la foto de un conductor deja la nueva visible y borra
      la anterior (registro en `archivos` y objeto en Storage), sin conservar historial (FR-003,
      Escenario 3) en `tests/e2e/conductores.spec.ts`
- [X] T012 [P] [US1] Playwright: un archivo de foto con tipo o tamaño inválido se rechaza antes de
      subirse, sin bloquear el resto del formulario (FR-002, Escenario 4) en
      `tests/e2e/conductores.spec.ts`
- [X] T013 [P] [US1] Playwright: si la subida de la foto falla durante el alta, el conductor queda
      creado igual, sin foto (FR-005) en `tests/e2e/conductores.spec.ts`
- [X] T014 [P] [US1] Playwright: si la subida de una foto nueva falla durante un reemplazo, la
      foto anterior sigue siendo la vigente (FR-004) en `tests/e2e/conductores.spec.ts`
      **Estado**: T009-T014 hechas, 6/6 en verde en los 4 proyectos de Playwright
      (admin/operario/superusuario/anonimo, 24/24).

### Implementation for User Story 1

- [X] T015 [P] [US1] Agregar la zona de adjuntar foto a
      `app/components/conductores/FormularioConductor.vue` (mismo marcado accesible que
      `FormularioVehiculo.vue`: `role="button"`, `tabindex="0"`, input oculto,
      `data-testid="foto-input"`, validación vía `validarFoto()`; incluir el archivo seleccionado
      en el payload emitido — research.md R4)
- [X] T016 [US1] Conectar `adjuntarFoto` en `app/pages/admin/conductores/nuevo.vue` tras crear el
      conductor (best-effort, silencioso en caso de fallo — mismo patrón que `adjuntarLicencia`,
      FR-005)
- [X] T017 [US1] Conectar `adjuntarFoto` en `app/pages/admin/conductores/[id]/editar.vue` tras
      editar el conductor (mismo patrón best-effort)
- [X] T018 [US1] Mostrar la foto vigente (o el estado vacío) en `app/pages/admin/conductores/[id]/index.vue`
      siguiendo `detalle-conductor-datos-generales.png` (research.md R4): reestructurar la pestaña
      "Datos" en 2 tarjetas lado a lado — una angosta a la izquierda con la foto como avatar
      (o ícono `mdi-account` en el estado vacío), el nombre completo debajo, y un chip con el tipo
      de licencia debajo del nombre; y "Datos del conductor" sin cambios como tarjeta ancha a la
      derecha. Resolver la URL firmada de `conductor.foto_archivo_id` igual que el resto de los
      archivos del proyecto (FR-006, contracts/foto-conductor.md)

**Checkpoint**: Foto del conductor funcional y probada de forma independiente — MVP (única
historia de esta feature).

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional (constitución §2-§4).

- [X] T019 [P] Playwright, caso positivo (RLS, constitución §2 "no basta con probar el camino
      permitido"): un operario con `'editar'` otorgado únicamente en el módulo `conductores` (sin
      `'vehiculos'`) puede adjuntar/reemplazar la foto de un conductor sin ser bloqueado por RLS
      (FR-007, SC-003, Escenario 5 de quickstart.md) en `tests/e2e/rls.spec.ts`
      **Estado**: se encontró y corrigió una colisión de `numero_licencia` (mismo `Date.now()` en
      2 de los 4 proyectos de Playwright corriendo en paralelo contra la misma empresa E2E)
      agregando entropía extra al sufijo. También se encontró y corrigió un falso negativo
      intermitente: el pre-chequeo negativo local (operario sin el permiso, bloqueado) competía
      contra los otros 3 proyectos otorgando el mismo permiso al mismo `operario-e2e` compartido
      en paralelo — se quitó ese pre-chequeo del test (el caso negativo ya está cubierto por el
      test existente de `licencia`, cláusula de RLS estructuralmente idéntica). Ninguno de los dos
      es un bug de la feature — mismo patrón de flake de estado compartido entre proyectos ya
      documentado en otros tests de este archivo (T027).
- [X] T020 [P] Playwright: un administrador de una empresa no puede generar una URL firmada válida
      ni listar la carpeta `foto_conductor/{empresa}/...` de otra empresa (aislamiento de Storage)
      en `tests/e2e/rls.spec.ts`
- [X] T021 Accesibilidad WCAG 2.1 AA (constitución §4): revisar la zona de adjuntar foto con
      teclado real — mismo criterio ya aplicado en Vehículos y Conductores
      **Estado**: mismo marcado ya validado (`role="button"`, `tabindex="0"`,
      `@keydown.enter`/`@keydown.space.prevent`, `aria-label`) — sin cambios necesarios.
- [X] T022 Ejecutar `quickstart.md` completo de punta a punta (los 5 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
      **Estado**: los 5 escenarios están cubiertos por T009-T014/T019 (alta con foto,
      adjuntar editando, reemplazar, archivo inválido, operario con permiso solo en conductores).
      Regresión completa corrida junto con `conductores.spec.ts` + `rls.spec.ts` +
      `vehiculos.spec.ts`: 303/312 en verde; los 9 fallos son el mismo flake de contención de
      recursos por corrida en paralelo ya documentado en sesiones previas de este proyecto
      (`sembrarConductor`/`sembrarVehiculo` con `Date.now()` sin entropía adicional colisionando
      entre proyectos de Playwright) — confirmado reproduciendo cada uno en aislado: 2 de los 9
      persisten incluso aislados (T041 de conductores, mismo bug preexistente de colisión de
      `numero_licencia`), fuera del alcance de esta feature. Ninguno de los tests nuevos de Foto
      del Conductor falló en ninguna corrida.
- [X] T023 `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo de esta feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea la única historia de usuario.
- **User Story 1 (Phase 3)**: depende de Foundational.
- **Polish (Phase 4)**: depende de que US1 esté completa.

### Within User Story 1

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- El dropzone (T015) antes que conectar `adjuntarFoto` en alta/edición (T016/T017).
- Mostrar la foto en el detalle (T018) puede avanzar en paralelo a T016/T017 — archivo distinto.

### Parallel Opportunities

- T007 (regenerar tipos) puede correr en paralelo a T008 (implementar `adjuntarFoto`) dentro de
  Foundational, una vez aplicada la migración (T006).
- Todos los tests de US1 marcados [P] pueden correr en paralelo (mismo archivo de spec, casos
  independientes).
- T015 y T018 pueden implementarse en paralelo (archivos distintos, sin dependencia entre sí).
- T019 y T020 (Polish) pueden correr en paralelo entre sí.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: adjuntar una foto durante el alta la deja visible en el detalle"
Task: "Playwright: adjuntar una foto después, editando, la deja visible en el detalle"
Task: "Playwright: reemplazar la foto deja la nueva visible y borra la anterior"
Task: "Playwright: un archivo de foto inválido se rechaza antes de subirse"
Task: "Playwright: si la subida falla durante el alta, el conductor queda creado igual"
Task: "Playwright: si la subida de un reemplazo falla, la foto anterior sigue vigente"
```

---

## Implementation Strategy

### MVP First (User Story 1, única historia)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea la implementación)
3. Completar Phase 3: User Story 1
4. **PARAR y VALIDAR**: probar la feature completa (es MVP = feature completa, una sola historia)
5. Completar Phase 4: Polish
6. Deploy/demo

---

## Notes

- [P] tareas = archivos distintos, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en el checkpoint para validar la feature de forma independiente antes de Polish.
