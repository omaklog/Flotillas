---

description: "Task list for Feature 003 — Vehículos"
---

# Tasks: Vehículos

**Input**: Design documents from `/specs/003-vehiculos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/vehiculos.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada regla
de negocio explícita en `spec.md` y, como mínimo, un caso negativo de RLS por cada tabla/bucket —
no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md), en el mismo orden de
prioridad ahí definido (P1 → P2 → P3).

**Esquema de base de datos**: `vehiculos`, `vehiculo_permisos` y `archivos` **ya existen** con su
RLS (Feature 001); `placa` ya es `NOT NULL` + `UNIQUE(empresa_id, placa)` (migración previa a
Catálogos Base). T002–T007 aplican una única migración nueva con lo que falta: bucket de Storage
`documentos` + su RLS, auditoría en las 3 tablas, y un ajuste a `archivos_delete` — ver
`data-model.md` sección "Extensiones sobre el esquema actual".

**Lecciones de Catálogos Base (002) a aplicar desde el inicio, no redescubrir**:
- El texto de búsqueda en `.or()` de PostgREST MUST escaparse (comillas dobles) — reusar la
  lógica ya corregida en `useCatalogo.ts`, no reimplementarla (un texto con paréntesis o comas
  rompía el filtro en silencio).
- Los `v-select` dentro de un `v-dialog` recién abierto necesitan una pequeña espera tras abrir el
  diálogo antes de interactuar con ellos (carrera con la animación de entrada de Vuetify) —
  patrón `abrirDialogo()` ya usado en `permisos-catalogo.spec.ts`.
- Las aserciones "fila visible tras crear/editar" MUST buscar primero por el buscador (patrón
  `buscarFila()`) en vez de asumir que la fila está en la primera página del listado — el
  catálogo compartido `Empresa E2E` acumula registros entre corridas.
- `getByLabel` sin `{ exact: true }` hace match parcial contra labels más largos (p. ej. el
  buscador puede contener la palabra de otro campo) — usar `exact: true` por defecto.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1–US7, ver spec.md; las tareas de "Foto
  del vehículo" no llevan label de historia por ser cruzadas entre US1/US3/US7, mismo criterio
  que Foundational/Polish)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend). Esta feature no agrega
nada a `server/api/` (research.md R5): toda la lectura/escritura, incluida la limpieza de
archivos al eliminar, va directo por `useSupabaseClient()`, protegida por RLS.

---

## Phase 1: Setup

**Purpose**: Referencias visuales requeridas antes de tocar cualquier CSS/componente de las
piezas nuevas de esta feature (regla obligatoria de `CLAUDE.md`; research.md R8).
`listado-flotilla.png` (ya existente) cubre US2 casi literalmente — no hace falta regenerarla.

- [X] T001 Generar/descargar en Stitch las referencias de las 3 piezas de UI que no existen
      todavía: formulario de alta/edición de vehículo (con zona de adjuntar póliza), pestaña de
      historial de versiones de póliza, y pestaña de permisos asignados al vehículo. Guardar los
      PNG en `docs/design-references/screens/` y añadir las filas correspondientes a
      `docs/design-references/screens.md` — el usuario generó "Listado de Flotilla de
      Vehículos", "Gestión de Vehículo: Alta y Edición" y "Detalle de Vehículo: Datos Generales"
      directo en Stitch. Descargadas y documentadas con 3 adaptaciones deliberadas respecto al
      mockup (ver nota en `screens.md`): pestañas "Datos Generales"+"Seguro y Póliza" del mockup
      se combinan en una sola pestaña "Datos" (nuestro formulario es más chico); se omite el
      filtro por categoría y la columna "Próx. Mantenimiento" del listado (fuera de alcance,
      Mantenimiento 004 no existe); se omiten las secciones de Conductor/Mantenimiento del
      detalle (Conductores/Mantenimiento no existen todavía). El resto del patrón (pestañas
      Historial de Póliza/Permisos, tabla del listado, botones de acción) sí se sigue tal cual.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Storage, auditoría y CRUD compartido por las 6 historias — ninguna historia puede
empezar su UI hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new vehiculos_storage_auditoria`
- [X] T003 En esa migración: crear el bucket `documentos` (`insert into storage.buckets`, privado,
      `file_size_limit = 10485760`, `allowed_mime_types = ['application/pdf','image/jpeg',
      'image/png']`) + sus 4 políticas de `storage.objects` (select/insert/update/delete),
      verificando `(storage.foldername(name))[2] = private.empresa_id()::text` (segundo
      segmento — el primero es `{tipo}`) y `tiene_permiso('vehiculos','ver'|'editar')` o
      admin/superusuario, calcadas del molde de `logos-empresas`
      (`20260807010000_storage_logos_empresas.sql`) con ese desplazamiento de segmento
      (research.md R3)
- [X] T004 En esa misma migración: crear función `private.audit_vehiculos()` — mismo molde que
      `private.audit_empresas_usuarios()` pero evaluando `old.baja is distinct from new.baja`
      (`new.baja = true → 'desactivar'`, `new.baja = false → 'reactivar'`, semántica invertida
      respecto a `activo`) + trigger `AFTER INSERT OR UPDATE OR DELETE` en `public.vehiculos`
      (research.md R4)
- [X] T005 En esa misma migración: triggers `AFTER INSERT OR UPDATE OR DELETE` en
      `public.vehiculo_permisos` y `public.archivos`, reusando `private.audit_catalogo()` ya
      creada en la migración de Catálogos Base — no se duplica la función (research.md R4)
- [X] T006 En esa misma migración: ajustar la política `archivos_delete` (definida en
      `initial_schema.sql`, hoy exige `rol = 'admin'` a secas) para aceptar también
      `tiene_permiso('vehiculos','editar')`, consistente con el resto de las políticas de
      escritura de esta feature (data-model.md, sección `archivos`, Nota)
- [X] T007 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: el
      bucket `documentos` existe y es privado (confirmado vía Storage API); subida de prueba vía
      REST con `service_role` a `poliza/{empresa}/{id}/x.pdf` aterriza en la ruta esperada
      (`(storage.foldername(name))[2]` = segmento de empresa, confirmado estructuralmente); dar
      de baja y reactivar un vehículo de prueba generó filas en `public.auditoria` con
      `accion = 'desactivar'` y `'reactivar'` respectivamente (no `'editar'`) — verificado
      end-to-end. **Diferido a T047** (Polish): la verificación de aislamiento cross-empresa con
      un cliente autenticado real (no `service_role`) — `docker exec` para inspección SQL directa
      quedó bloqueado por permisos de la sesión, igual que en Catálogos Base; se cubre con el
      test Playwright dedicado en vez de curl manual.
- [X] T008 Regenerar `app/types/database.types.ts` (`supabase gen types typescript --local`)
- [X] T009 [P] Implementar `app/utils/archivos.ts`: función que valida tipo MIME
      (`application/pdf`, `image/jpeg`, `image/png`) y tamaño (≤10 MB) de un `File` antes de
      subirlo, devolviendo un mensaje de error claro si no cumple; función que genera un nombre
      de archivo único para evitar colisiones en la misma carpeta (FR-004, research.md R6) —
      verificado funcionalmente con node (diacríticos, nombre vacío → "archivo")
- [X] T010 Implementar `app/composables/useVehiculos.ts`: `listar(busqueda, incluirBaja)`
      (reusa la lógica de escape de `useCatalogo.ts` para el `.or()` de PostgREST — ver "Lecciones
      de Catálogos Base" arriba), `crear` (paso 1, sin archivo), `adjuntarPoliza(vehiculoId,
      archivo)` (paso 2: sube a Storage vía `archivos.ts` + inserta fila en `archivos` +
      actualiza `vehiculos.poliza_archivo_id`), `editar`, `darDeBaja(id, motivo)`,
      `reactivar(id)`, `eliminar(id)` (3 pasos ordenados de contracts/vehiculos.md — vehículo
      primero, limpieza de `archivos`+Storage después, solo si el primero tuvo éxito),
      `listarHistorialPoliza(vehiculoId)`, `descargarArchivo(storagePath)` (URL firmada, 60s),
      y el sub-CRUD de `vehiculo_permisos` (`listarPermisos`, `asignarPermiso`,
      `editarVencimientoPermiso`, `quitarPermiso`) — mapeo de errores `23505`→duplicado (placa o
      permiso ya asignado) y `23503`→dependientes, mismo patrón que `useCatalogo.ts`. El mensaje
      de `23503` parsea el nombre de la tabla dependiente del propio mensaje de Postgres
      (`foreign key constraint "..." on table "(\w+)"`) para dar el mensaje específico que pide
      US-3.5 ("tiene mantenimientos registrados", no un genérico) — verificado funcionalmente con
      node. `yarn typecheck`/`yarn lint` en verde.

**Checkpoint**: Fundación lista — las 6 historias de usuario pueden empezar (con las dependencias
entre ellas que se listan en "Dependencies & Execution Order" al final, ya que a diferencia de
Catálogos Base varias de estas historias comparten página).

---

## Phase 3: User Story 1 - Administrador da de alta un vehículo (Priority: P1) 🎯 MVP (parte 1/2)

**Goal**: El administrador puede registrar un vehículo con sus datos, con o sin póliza adjunta en
el momento del alta.

**Independent Test**: Completar el alta sin póliza (aparece sin ella); completar el alta con
póliza adjunta (aparece con ella vigente); confirmar que un fallo de subida no revierte el alta.

### Tests for User Story 1

- [X] T011 [P] [US1] Playwright: alta sin póliza crea el vehículo con los campos obligatorios en
      `tests/e2e/vehiculos.spec.ts`
- [X] T012 [P] [US1] Playwright: alta con póliza adjunta (PDF de prueba) crea el vehículo con la
      póliza vigente en `tests/e2e/vehiculos.spec.ts`
- [X] T013 [P] [US1] Playwright: alta rechazada por placa duplicada dentro de la misma empresa,
      marcada en el formulario antes de enviar, en `tests/e2e/vehiculos.spec.ts`
- [X] T014 [P] [US1] Playwright: un archivo con tipo (p. ej. `.txt`) o tamaño (>10 MB) inválido se
      rechaza antes de intentar subirse, sin bloquear el resto del formulario en
      `tests/e2e/vehiculos.spec.ts`
- [X] T015 [P] [US1] Playwright: si la subida del archivo de póliza falla (interceptar la
      petición de Storage con `page.route()` y forzar un error), el vehículo del paso 1 queda
      creado igual, sin póliza — el alta completa no se pierde (FR-005) en
      `tests/e2e/vehiculos.spec.ts`

      **Estado de la fase**: las 5 corridas contra `--project=admin` — confirmado en rojo (5/5
      fallan, `/admin/vehiculos/nuevo` no existe todavía).

### Implementation for User Story 1

- [X] T016 [P] [US1] Implementar `app/components/vehiculos/FormularioVehiculo.vue` (marca,
      modelo, placa, color, número de serie, número de motor, capacidad de carga, año, número de
      ejes, selects de tipo de vehículo/aseguradora desde Catálogos Base, número de póliza,
      fecha de vencimiento, zona de adjuntar/reemplazar archivo con validación vía
      `app/utils/archivos.ts`; reusable en alta y edición vía prop `registro` opcional, mismo
      patrón que `FormularioTipoVehiculo.vue` de Catálogos Base)
- [X] T017 [US1] Implementar `app/pages/admin/vehiculos/nuevo.vue` (usa `FormularioVehiculo.vue` +
      `useVehiculos().crear` + `adjuntarPoliza` en secuencia)
- [X] T018 [US1] Agregar entrada "Vehículos" a `app/layouts/admin.vue`
      (`v-list-item to="/admin/vehiculos"`)

**Checkpoint**: Alta de vehículo funcional y probada de forma independiente.

**Estado de la fase**: 3/5 tests en verde (T013 placa duplicada, T014 archivo inválido, T015
fallo de subida). T011 y T012 siguen en rojo — ambos navegan a `/admin/vehiculos` tras el alta y
verifican la fila creada ahí, pero `index.vue` (US2, T022) todavía no existe, así que caen en el
404. Es la dependencia ya documentada en "Dependencies & Execution Order" (MVP = US1+US2 juntas);
quedarán en verde al completar la Fase 4.

---

## Phase 4: User Story 2 - Administrador busca y consulta el listado de vehículos (Priority: P1) 🎯 MVP (parte 2/2)

**Goal**: El administrador ve el listado de vehículos activos de su empresa, puede buscar por
marca/modelo/placa, y ve el estado de vigencia de póliza de cada uno.

**Independent Test**: Con vehículos sembrados (vía UI de US1 o directo por `service_role`), abrir
el listado, confirmar que aparecen con su estado de póliza, buscar por cada criterio, y confirmar
que los dados de baja quedan ocultos por defecto.

### Tests for User Story 2

- [X] T019 [P] [US2] Playwright: el listado muestra los vehículos activos de la empresa, y el
      buscador filtra por marca, modelo y placa en `tests/e2e/vehiculos.spec.ts`
- [X] T020 [P] [US2] Playwright: un vehículo dado de baja (sembrado con `baja=true` vía
      `service_role`) no aparece en el listado por defecto; activar "Mostrar dados de baja" lo
      incluye en `tests/e2e/vehiculos.spec.ts`
- [X] T021 [P] [US2] Playwright: un vehículo con `fecha_vencimiento_poliza` en el pasado se
      muestra como "vencida", uno a 30 días se muestra como "por vencer" (umbral de 60 días,
      Clarifications sesión 2026-08-08), y uno a 120 días como "vigente" en
      `tests/e2e/vehiculos.spec.ts`

      **Estado**: confirmado en rojo (3/3 fallan, `/admin/vehiculos` no existe todavía).

### Implementation for User Story 2

- [X] T022 [US2] Implementar `app/pages/admin/vehiculos/index.vue` (reusa
      `CatalogosTablaCatalogo.vue` de Catálogos Base + `useVehiculos().listar` + toggle "Mostrar
      dados de baja" + badge de estado de póliza con colores `success`/`warning`/`error` de
      `vuetify.config.ts`, siguiendo `listado-flotilla.png` como referencia — research.md R8)

**Checkpoint**: MVP completo — US1 + US2 funcionan juntas de forma independiente del resto.

**Estado de la fase**: las 8 pruebas de `vehiculos.spec.ts` (US1 + US2) en verde. Un bug real de
prueba se encontró y se corrigió en el camino: `T012` usaba
`page.waitForURL('**/admin/vehiculos**')`, un glob que coincide de inmediato con la propia
`/admin/vehiculos/nuevo` en la que ya está la página (no espera el redirect real tras el envío);
se cambió a un predicado de path exacto (`url.pathname === '/admin/vehiculos'`). `T011` tenía el
mismo problema pero pasaba por casualidad — su rama de fallback + los reintentos internos de
`buscarFila()` absorbían la carrera. También se ajustaron los nombres de marca sembrados en
`T021` (contenían la palabra "Vencida"/"Vigente", chocando en modo estricto con el texto del
propio chip de estado).

---

## Phase 5: User Story 3 - Administrador edita un vehículo y gestiona el historial de su póliza (Priority: P2)

**Goal**: El administrador puede editar cualquier dato de un vehículo y reemplazar su archivo de
póliza sin perder las versiones anteriores.

**Independent Test**: Editar un campo de un vehículo existente y confirmar el cambio; reemplazar
su póliza y confirmar que la versión anterior sigue disponible en el historial, no marcada como
vigente.

**Depende de US1** (reusa `FormularioVehiculo.vue`) y crea la página de detalle que US4 y US6
necesitan como base — ver "Dependencies" al final.

### Tests for User Story 3

- [X] T023 [P] [US3] Playwright: editar campos de un vehículo existente (incluida la aseguradora
      y el número de póliza) guarda los cambios en `tests/e2e/vehiculos.spec.ts`
- [X] T024 [P] [US3] Playwright: reemplazar el archivo de póliza dejar el nuevo como vigente sin
      borrar el anterior en `tests/e2e/vehiculos.spec.ts`
- [X] T025 [P] [US3] Playwright: el historial de versiones muestra ambas versiones ordenadas por
      fecha descendente, cada una con quién la subió y un enlace de descarga, y solo la más
      reciente marcada "Vigente" en `tests/e2e/vehiculos.spec.ts`
- [X] T026 [P] [US3] Playwright: descargar una versión no vigente desde el historial resuelve una
      URL válida y descarga el archivo correcto en `tests/e2e/vehiculos.spec.ts`

### Implementation for User Story 3

- [X] T027 [P] [US3] Implementar `app/components/vehiculos/HistorialPoliza.vue` (lista de
      versiones vía `useVehiculos().listarHistorialPoliza`, botón de descarga vía
      `descargarArchivo`, badge "Vigente" comparando contra `vehiculos.poliza_archivo_id`)
- [X] T028 [US3] Implementar `app/pages/admin/vehiculos/[id].vue`: estructura base con pestañas
      (Datos, Historial de Póliza, Permisos — esta última placeholder hasta US6); la pestaña
      Datos reusa `FormularioVehiculo.vue` en modo edición (prop `registro`)
- [X] T029 [US3] Conectar el reemplazo de póliza desde la pestaña Datos de `[id].vue` (mismo
      `adjuntarPoliza` de `useVehiculos`, ahora sobre un vehículo existente) y montar
      `HistorialPoliza.vue` en su pestaña

**Checkpoint**: Edición y gestión de póliza funcionales, probadas de forma independiente.

**Estado de la fase**: 12/12 pruebas de `vehiculos.spec.ts` en verde (US1+US2+US3 juntas),
`typecheck`/`lint` limpios. `useVehiculos().descargarArchivo` se extendió con un parámetro
`nombreDescarga` que fuerza `Content-Disposition: attachment` en la URL firmada (necesario para
que la descarga cross-origin dispare un evento `download` real en el navegador, no solo abra el
PDF inline). Test y componentes se diseñaron en conjunto (no se verificó un estado rojo por
separado antes de implementar, a diferencia de las fases anteriores) porque los testids del
historial (`historial-poliza-item-{id}`, `vigente-badge-{id}`, `descargar-btn-{id}`) solo tenían
sentido una vez definida la forma del componente.

---

## Phase 6: User Story 4 - Administrador da de baja y reactiva un vehículo (Priority: P2)

**Goal**: El administrador puede dar de baja un vehículo (con motivo obligatorio) y reactivarlo,
sin perder su historial.

**Independent Test**: Dar de baja un vehículo capturando un motivo; confirmar que desaparece del
listado por defecto; reactivarlo y confirmar que vuelve a aparecer.

**Depende de US3** (usa la página de detalle `[id].vue` ya creada) — ver "Dependencies" al final.

### Tests for User Story 4

- [X] T030 [P] [US4] Playwright: intentar confirmar "Dar de baja" sin capturar un motivo lo
      bloquea en `tests/e2e/vehiculos.spec.ts`
- [X] T031 [P] [US4] Playwright: dar de baja con un motivo (≤150 caracteres) oculta el vehículo
      del listado por defecto (reusa el toggle de US2) en `tests/e2e/vehiculos.spec.ts`
- [X] T032 [P] [US4] Playwright: reactivar un vehículo dado de baja lo regresa al listado por
      defecto, y la acción "Reactivar" no está disponible para un vehículo ya activo en
      `tests/e2e/vehiculos.spec.ts`
- [X] T033 [P] [US4] Playwright: dar de baja y reactivar generan filas en `public.auditoria` con
      `accion = 'desactivar'`/`'reactivar'`, no `'editar'` (verificado vía `service_role`) en
      `tests/e2e/vehiculos.spec.ts`

### Implementation for User Story 4

- [X] T034 [P] [US4] Implementar `app/components/vehiculos/DialogoDarDeBaja.vue` (campo de motivo
      obligatorio con contador de caracteres, máximo 150, mismo patrón de diálogo que
      `DialogoConfirmarEliminarCatalogo.vue` de Catálogos Base)
- [X] T035 [US4] Conectar los botones "Dar de baja"/"Reactivar" en `app/pages/admin/vehiculos/[id].vue`
      usando `useVehiculos().darDeBaja`/`reactivar`

**Checkpoint**: Baja/reactivación funcional, probada de forma independiente.

**Estado de la fase**: 16/16 pruebas de `vehiculos.spec.ts` en verde (US1-US4 juntas),
`typecheck`/`lint` limpios. Se agregó también un enlace desde `index.vue` (marca/modelo de cada
fila) hacia `[id].vue`, necesario para que estos tests naveguen al detalle — no estaba en el
alcance literal de T022 pero era la única forma de llegar a la página de detalle desde el
listado. Nota de implementación: el `data-testid` de `v-textarea` en Vuetify cae en el `<div>`
contenedor, no en el `<textarea>` real — los tests usan `getByLabel('Motivo de la baja')` para
`.fill()`, y el testid solo para comprobar visibilidad/estado.

---

## Phase 7: User Story 5 - Administrador elimina definitivamente un vehículo sin historial (Priority: P3)

**Goal**: El administrador puede eliminar por completo un vehículo sin registros dependientes,
incluida la limpieza de su historial de archivos de póliza.

**Independent Test**: Intentar eliminar un vehículo con un dependiente sembrado vía
`service_role` (bloqueado con mensaje claro); eliminar uno sin dependientes pero con póliza
adjunta y confirmar que su historial de archivos también desaparece.

**Depende solo de US2** (el botón de eliminar vive en el listado, vía la fila de
`TablaCatalogo.vue`) — independiente de US3/US4/US6.

### Tests for User Story 5

- [X] T036 [P] [US5] Playwright: eliminar un vehículo con una carga de combustible sembrada vía
      `service_role` (Combustible 004 no existe todavía — mismo patrón de "sembrar solo lo
      necesario" que `usuarios.spec.ts` T073) se rechaza con un mensaje claro y no borra nada en
      `tests/e2e/vehiculos.spec.ts`
- [X] T037 [P] [US5] Playwright: eliminar un vehículo sin dependientes pero con una póliza
      adjunta borra también su fila en `archivos` y el objeto en Storage — verificado
      directamente contra la base de datos y Storage vía `service_role`, sin huérfanos (FR-016a)
      en `tests/e2e/vehiculos.spec.ts`
- [X] T038 [P] [US5] Playwright: eliminar un vehículo sin ningún dato adjunto procede sin error en
      `tests/e2e/vehiculos.spec.ts`

### Implementation for User Story 5

- [X] T039 [US5] Conectar el botón "Eliminar" en la fila de `app/pages/admin/vehiculos/index.vue`
      (reusa `CatalogosDialogoConfirmarEliminarCatalogo.vue` de Catálogos Base) usando
      `useVehiculos().eliminar` (3 pasos ordenados de `contracts/vehiculos.md`)

**Checkpoint**: Eliminación con limpieza funcional, probada de forma independiente.

**Estado de la fase**: 19/19 pruebas de `vehiculos.spec.ts` en verde (US1-US5 juntas),
`typecheck`/`lint` limpios. T036 sembró `proveedores`/`productos`/`cargas_combustible` mínimos
(esas tablas ya existen en el schema desde `initial_schema.sql`, aunque Combustible 004 no tiene
UI todavía) para ejercer el guard FK real del `DELETE`.

---

## Phase 8: User Story 6 - Administrador asigna los permisos aplicables a un vehículo (Priority: P3)

**Goal**: El administrador puede asignar tipos de permiso del catálogo a un vehículo con su
propia fecha de vencimiento, editarla o quitar la asignación.

**Independent Test**: Asignar un permiso con fecha de vencimiento; confirmar que aparece; intentar
duplicarlo (rechazado); editar su fecha; quitarlo.

**Depende de US3** (usa la pestaña "Permisos" de `[id].vue`, creada como placeholder en T028) —
depende también de que exista al menos un permiso en el catálogo de Catálogos Base (002).

### Tests for User Story 6

- [X] T040 [P] [US6] Playwright: asignar un permiso del catálogo con fecha de vencimiento lo
      muestra en la lista de permisos aplicables del vehículo en `tests/e2e/vehiculos.spec.ts`
- [X] T041 [P] [US6] Playwright: asignar el mismo permiso dos veces al mismo vehículo se rechaza
      como duplicado (FR-018) en `tests/e2e/vehiculos.spec.ts`
- [X] T042 [P] [US6] Playwright: editar la fecha de vencimiento de una asignación existente se
      refleja de inmediato en `tests/e2e/vehiculos.spec.ts`
- [X] T043 [P] [US6] Playwright: quitar una asignación la quita de la lista del vehículo sin
      afectar el catálogo general de permisos (Catálogos Base) en `tests/e2e/vehiculos.spec.ts`

### Implementation for User Story 6

- [X] T044 [P] [US6] Implementar `app/components/vehiculos/PermisosVehiculo.vue` (lista de
      asignaciones vía `useVehiculos().listarPermisos`, selector de permisos del catálogo,
      edición inline de fecha de vencimiento, botón quitar)
- [X] T045 [US6] Montar `PermisosVehiculo.vue` en la pestaña "Permisos" de
      `app/pages/admin/vehiculos/[id].vue` (reemplaza el placeholder de T028)

**Checkpoint**: Las 6 historias funcionan de forma independiente (respetando sus dependencias
documentadas).

**Estado de la fase**: 23/23 pruebas de `vehiculos.spec.ts` en verde (las 6 historias juntas),
`typecheck`/`lint` limpios. Desviación deliberada de la tarea: se implementó con `v-autocomplete`
en vez de `v-select` para el selector de "Permiso" — el catálogo `permisos` de la empresa
compartida de E2E ya acumula 50+ registros entre corridas, y Vuetify virtualiza las listas largas
de `v-select` (los ítems fuera del rango visible no existen en el DOM hasta hacer scroll); un
`v-select` habría sido tanto mala UX real como no confiablemente testeable. `v-autocomplete` con
filtro por texto resuelve ambos. Bug de test encontrado y corregido en el camino: el `.select('id')`
del seed de `permisos` no traía `nombre`, dejando `permisoNombre` en `undefined` — con eso,
`getByRole('option', {name: undefined})` deja de filtrar y coincide con todas las opciones (de
ahí el primer fallo, con un timeout de 30s esperando un clic ambiguo).

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Verificaciones que cruzan las 6 historias.

- [X] T046 [P] Playwright (RLS negativo, constitución §4): un operario con solo permiso `ver` en
      el módulo `vehiculos` no puede crear, editar, dar de baja, reactivar ni eliminar vehículos,
      ni gestionar sus permisos asignados — consolidado en `tests/e2e/rls.spec.ts`, mismo
      criterio que Catálogos Base (T020/T030/T041 de esa feature). quickstart.md Escenario 7.
- [X] T047 [P] Playwright: aislamiento del bucket `documentos` por empresa — un administrador de
      una empresa no puede generar una URL firmada válida ni listar la carpeta de otra empresa
      (SC-007) — en `tests/e2e/rls.spec.ts`
- [X] T048 [P] Verificar accesibilidad WCAG 2.1 AA (labels asociados, foco visible, contraste,
      zona de subida de archivo navegable por teclado) en el formulario, el listado, y las 2
      pestañas nuevas del detalle (constitución §4)

      **Verificación manual/por código** (sin tooling automatizada de a11y en el proyecto, mismo
      criterio que Catálogos Base T045): (1) todos los campos de texto/select/fecha usan el prop
      `label` de Vuetify (asociación nativa vía `aria-labelledby`; confirmado indirectamente por
      los 23 tests de `vehiculos.spec.ts`, que ubican los campos con `page.getByLabel(...)`); (2)
      la zona de adjuntar/reemplazar póliza (`FormularioVehiculo.vue`) es un `<div>` con
      `role="button"`, `tabindex="0"`, `aria-label="Adjuntar póliza"` y maneja `Enter`/`Espacio`,
      no solo click — navegable por teclado; (3) los botones ícono-solamente tienen `aria-label`
      explícito: `eliminar-btn` de `index.vue` (`Eliminar {marca} {modelo}`) y, encontrados y
      corregidos durante esta verificación (no lo tenían), `guardar-vencimiento`/`quitar-btn` de
      `PermisosVehiculo.vue` (`Guardar vencimiento de {permiso}`/`Quitar {permiso}`); los botones
      "Dar de baja"/"Reactivar"/"Descargar"/"Asignar" tienen texto visible, no dependen de
      `aria-label`; (4) `app/assets/css/main.css` define `:focus-visible` global, sin overrides
      nuevos en esta feature; (5) colores: `success`/`warning`/`error`/`primary` ya vetados
      (badges de vigencia de póliza, chip de baja); `grey` (chip "Baja"/"Sin póliza") usa el
      cómputo de contraste automático de Vuetify para `variant="tonal"`/default, mismo mecanismo
      que protege a los colores semánticos ya auditados — no es un color bespoke con contraste
      manual; (6) tablas (`index.vue`, `HistorialPoliza.vue` vía `v-list`) usan elementos
      semánticos de Vuetify (`v-table`→`<th>`/`<td>`, `v-list-item`→`role="listitem"`), no `<div>`
      genéricos.
- [X] T049 Ejecutar `quickstart.md` de punta a punta y confirmar en `public.auditoria` una fila
      por cada alta/edición/baja/reactivación/eliminación de vehículo y por cada asignación/
      edición/eliminación de permiso, con `valores_antes`/`valores_despues` coherentes

      Los 7 escenarios de `quickstart.md` quedan cubiertos por la suite automatizada (T011-T047,
      corrida completa: 23/23 `vehiculos.spec.ts` + 9/9 `rls.spec.ts`, sin `--project` único).
      Verificación adicional vía REST con `service_role` sobre `public.auditoria`, igual que
      T047 de Catálogos Base: las combinaciones `entidad × accion` esperadas están todas
      presentes — `vehiculos`: crear (147), editar (43), desactivar (16), reactivar (9), eliminar
      (6); `vehiculo_permisos`: crear (19), editar (4), eliminar (5); `archivos`: crear (43),
      eliminar (3) — acumuladas por toda la suite de Feature 003. Una fila de muestra de
      `vehiculos`/`editar` confirma `valores_antes`/`valores_despues` coherentes: mismo `id`,
      mismos campos salvo `poliza_archivo_id` (`null` → uuid real) y `updated_at`, consistente
      con el flujo de reemplazo de póliza de T037.

**Regresión final entre features (post-T049)**: antes de dar la feature por cerrada se corrió
`yarn playwright test` sin filtrar archivo (las 4 features juntas, las 4 sesiones de
`playwright.config.ts` en paralelo — cada spec corre una vez por sesión, no hay `testMatch` que
lo evite). Aparecieron fallas reales que las corridas aisladas de este documento no habían
expuesto:

1. **Bug real de aplicación (regresión entre features)** — la migración de Foundational de esta
   feature (`20260808174129_vehiculos_storage_auditoria.sql`) reescribió la política
   `archivos_delete` mirando la versión de `initial_schema.sql` (`rol = 'admin'` a secas) sin
   notar que `modulos_y_permisos.sql` (Feature 001) ya la había refinado para aceptar
   `tiene_permiso('archivos','eliminar')` — el resultado reemplazó ese chequeo por
   `tiene_permiso('vehiculos','editar')` en vez de sumarlo, rompiendo el permiso granular
   genérico de `archivos` (expuesto por `tests/e2e/permisos.spec.ts` T056, ajeno a esta feature).
   Corregido en una migración nueva (`20260808190645_fix_archivos_delete_permiso_granular.sql`)
   que deja ambos caminos: `tiene_permiso('archivos','eliminar')` (cualquier archivo) OR
   `entidad_tipo = 'vehiculo' and tiene_permiso('vehiculos','editar')` (limpieza de pólizas al
   eliminar/editar un vehículo, FR-016a, sin exigir un permiso redundante).
2. **Bug real de aplicación (mismo defecto ya corregido una vez en esta feature, sin generalizar
   la lección)** — los selects "Tipo de vehículo" y "Aseguradora" de `FormularioVehiculo.vue`
   seguían siendo `v-select` (no `v-autocomplete`, a diferencia de "Permiso" en
   `PermisosVehiculo.vue`, ya corregido durante US6). Con los catálogos compartidos de
   `Empresa E2E` ya crecidos a 60+ registros entre `tipos_vehiculo` y `aseguradoras`
   (acumulados por Catálogos Base y por esta misma feature a lo largo de la sesión), Vuetify
   virtualiza la lista y "Vehículo ligero"/una aseguradora recién creada dejan de existir en el
   DOM hasta hacer scroll — reproducible incluso en corridas de un solo archivo una vez que el
   catálogo cruzó ese umbral. Corregido igual que "Permiso": ambos a `v-autocomplete`, tests
   actualizados para escribir el texto exacto (`getByRole('combobox', {name}).fill(...)`) en vez
   de abrir el menú y buscar la opción entre docenas.
3. **Flake confirmada, no regresión** — `permisos-catalogo.spec.ts` T037 (Catálogos Base, ajena a
   esta feature) falló una vez en la corrida combinada de 41 pruebas y pasó de forma consistente
   en aislamiento; es contención de recursos del servidor de desarrollo compartido bajo carga
   pesada, no un defecto de código.

Verificación final tras ambos fixes: `tests/e2e/vehiculos.spec.ts` + `rls.spec.ts` +
`permisos.spec.ts` + `permisos-catalogo.spec.ts` juntos, `--project=admin`: 40/41 (el único
fallo es el flake #3, confirmado no reproducible en aislamiento). `vehiculos.spec.ts` solo:
23/23. `typecheck`/`lint` limpios.

---

## Fases agregadas por `/speckit-clarify` (sesión 2026-08-08, post-implementación)

Tras cerrar T001-T049, el usuario señaló dos brechas contra la referencia de Stitch
(`detalle-vehiculo-datos-generales.png`) que `/speckit-clarify` confirmó y resolvió: (1) no
existe una vista de detalle de solo lectura — el listado lleva directo al formulario editable;
(2) no hay opción para adjuntar una foto del vehículo. Ambas quedaron integradas en `spec.md`
(`## Clarifications`, sesión 2026-08-08, FR-022 a FR-025, User Story 7). Las Fases 10-11 abajo
son trabajo **nuevo, todavía no implementado** — a diferencia de las Fases 1-9, ninguna de sus
tareas está marcada `[X]`.

**Nota de alcance**: `plan.md`, `data-model.md` y `contracts/vehiculos.md` siguen reflejando el
diseño original (6 historias, sin vista de detalle separada ni foto) — no se regeneraron como
parte de este `/speckit-tasks` para no perder el diseño ya validado de lo ya construido. T060 y
T053 incluyen en su propia descripción la actualización puntual de `data-model.md`/`contracts/
vehiculos.md` que les corresponde, siguiendo el mismo criterio que T008 en Foundational (regenerar
`database.types.ts` como parte de la tarea de migración, no como tarea aparte).

**Lección para estas 2 fases** (de la sección "Regresión final" arriba, generalizada): cualquier
`v-select` nuevo sobre un catálogo compartido de `Empresa E2E` MUST ser `v-autocomplete` desde el
inicio, no `v-select` — ya se corrigió 3 veces en esta feature (Permiso, Tipo de vehículo,
Aseguradora) por el mismo motivo (Vuetify virtualiza listas largas). No aplica aquí porque estas
2 fases no agregan selects nuevos, pero queda anotado para Conductores/Combustible/Mantenimiento.

## Phase 10: User Story 7 - Administrador consulta el detalle de un vehículo sin entrar a edición (Priority: P2)

**Goal**: Separar la vista de detalle (solo lectura) de la edición — el listado abre el detalle,
no el formulario; una acción "Editar" explícita lleva al formulario.

**Independent Test**: Abrir un vehículo desde el listado y confirmar que se muestra en modo solo
lectura, sin campos editables; usar "Editar", confirmar que abre el formulario con los datos
precargados; guardar y confirmar que regresa al detalle con los datos actualizados.

**Depende de US1** (reusa `FormularioVehiculo.vue`) **y de US3** (reutiliza `[id].vue`, que hoy
aloja el formulario directo — esta historia lo convierte en la vista de solo lectura y mueve el
formulario a una ruta nueva). US4 (baja/reactivar) y US6 (permisos) siguen viviendo en la misma
página de detalle sin cambios en su propio comportamiento.

### Tests for User Story 7

- [X] T050 [P] [US7] Playwright: abrir un vehículo desde el listado muestra su detalle en modo
      solo lectura — datos generales, estado de póliza, y ningún campo editable — en
      `tests/e2e/vehiculos.spec.ts`
- [X] T051 [P] [US7] Playwright: la acción "Editar" desde el detalle navega al formulario con los
      datos del vehículo precargados en `tests/e2e/vehiculos.spec.ts`
- [X] T052 [P] [US7] Playwright: guardar cambios en el formulario regresa a la vista de detalle
      mostrando los datos ya actualizados (no se queda en el formulario) en
      `tests/e2e/vehiculos.spec.ts`

      **Estado**: confirmado en rojo (3/3 fallan, `/admin/vehiculos/[id]/editar` no existe
      todavía y `editar-btn` no existe en `[id].vue`).

### Implementation for User Story 7

- [X] T053 [US7] Convertir `app/pages/admin/vehiculos/[id].vue` en vista de solo lectura: quita
      `FormularioVehiculo` de la pestaña "Datos" y la reemplaza por una presentación de solo
      lectura de los mismos campos (marca, modelo, placa, color, año, tipo de vehículo,
      aseguradora, número/vencimiento de póliza) más un botón "Editar" en el header, junto a
      "Dar de baja"/"Reactivar" ya existentes; las pestañas "Historial de Póliza" y "Permisos" no
      cambian. Actualizar `data-model.md`/`contracts/vehiculos.md` con la nota de que el detalle
      ya no reusa `FormularioVehiculo.vue` directamente.
- [X] T054 [US7] Implementar `app/pages/admin/vehiculos/[id]/editar.vue`: mueve ahí la lógica de
      `onEditar`/`adjuntarPoliza` que hoy vive en `[id].vue`, reusando `FormularioVehiculo.vue` en
      modo edición (prop `registro`) igual que antes; al guardar exitosamente, `navigateTo` de
      vuelta a `/admin/vehiculos/{id}` (no se queda en el formulario, T052).
- [X] T055 [US7] Conectar el botón "Editar" de `[id].vue` (T053) con la ruta `[id]/editar.vue`
      (T054); agregar un botón/enlace "Cancelar" en `editar.vue` que regrese al detalle sin
      guardar.

      **Hallazgo real durante la implementación**: tener `app/pages/admin/vehiculos/[id].vue`
      (archivo) y `app/pages/admin/vehiculos/[id]/editar.vue` (carpeta) al mismo tiempo crea una
      relación de ruta anidada en Nuxt (`NUXT_E4016`) — la ruta hija no renderiza a menos que el
      padre incluya `<NuxtPage/>`. Se movió el detalle a `app/pages/admin/vehiculos/[id]/index.vue`
      para que ambas sean rutas hermanas independientes, no padre-hijo. `data-model.md` actualizado
      con esta nota. T023/T024 (US3, ya existentes) se ajustaron para navegar a `[id]/editar` en
      vez de `[id]` directo, ya que el formulario se movió — 26/26 `vehiculos.spec.ts` +
      9/9 `rls.spec.ts` en verde tras el ajuste, `typecheck`/`lint` limpios.

**Checkpoint**: Vista de detalle funcional, probada de forma independiente sobre US1/US3 ya
construidas; US4 y US6 siguen funcionando sin cambios (sus tests existentes no deben requerir
ajustes salvo que dependan de un flujo de navegación que este cambio ya no reproduce).

---

## Phase 11: Foto del vehículo (FR-023, FR-024, FR-025 — cruza US1, US3, US7)

**Goal**: Permitir adjuntar/reemplazar una foto opcional del vehículo (JPG/PNG, 10 MB), visible
en el detalle de solo lectura (T053), sin historial de versiones (a diferencia de la póliza).

**Independent Test**: Adjuntar una foto durante el alta o la edición y confirmar que aparece en
el detalle; reemplazarla y confirmar (vía `service_role`) que la versión anterior ya no existe ni
en `archivos` ni en Storage — a diferencia de la póliza, que sí conserva historial.

**Depende de US1** (formulario de alta), **US3** (formulario de edición) **y US7** (vista de
detalle donde se muestra, T053) — puede implementarse en cualquier momento después de esas tres,
no bloquea ni es bloqueada por Polish (Fase 9, ya cerrada).

### Foundational para esta fase

- [X] T056 Crear una migración nueva (`supabase migration new vehiculos_foto`): `alter type
      tipo_archivo add value 'foto'` + `alter table public.vehiculos add column foto_archivo_id
      uuid references public.archivos(id)`. **Cuidado**: Postgres no permite usar un valor de
      enum recién agregado con `ALTER TYPE ... ADD VALUE` dentro de la misma transacción en la
      que se agregó — si `supabase migration up` aplica cada archivo en una sola transacción,
      esta migración MUST limitarse a los dos `ALTER` y nada más (ninguna inserción con
      `tipo = 'foto'` en la misma migración); verificar contra el comportamiento real del CLI
      antes de asumir que funciona. Aplicar (`supabase migration up`), regenerar
      `app/types/database.types.ts` (`supabase gen types typescript --local`), y actualizar la
      tabla de `data-model.md` (sección `vehiculos`: nueva columna; sección `archivos`: nuevo
      valor de `tipo`) y `contracts/vehiculos.md` (nuevo contrato de subida/reemplazo de foto,
      mismo molde que el de póliza pero sin paso de conservar historial).

      **Verificado**: `supabase migration up` aplicó ambos `ALTER` en una sola migración sin
      error (el `ADD VALUE` y el `ADD COLUMN` conviven bien porque ninguno de los dos inserta
      datos que usen `'foto'` todavía). Confirmado funcionalmente insertando y borrando una fila
      de prueba con `tipo: 'foto'` vía REST/`service_role`. `database.types.ts` regenerado
      (`tipo_archivo` ahora incluye `"foto"`, `vehiculos.foto_archivo_id` presente).

### Tests for Foto del vehículo

- [X] T057 [P] Playwright: adjuntar una foto durante el alta la deja visible en el detalle del
      vehículo en `tests/e2e/vehiculos.spec.ts`
- [X] T058 [P] Playwright: reemplazar la foto de un vehículo dejar la nueva visible y elimina la
      anterior — verificado vía `service_role` que la fila anterior en `archivos` y su objeto en
      Storage ya no existen (a diferencia de T024, que verifica lo opuesto para la póliza) en
      `tests/e2e/vehiculos.spec.ts`
- [X] T059 [P] Playwright: un archivo de foto con tipo o tamaño inválido se rechaza antes de
      subirse, mismo criterio que T014 para la póliza, en `tests/e2e/vehiculos.spec.ts`
- [X] T060 [P] Playwright: si la subida de una foto nueva falla durante un reemplazo, la foto
      anterior sigue siendo la vigente — no se pierde ni se borra antes de confirmar que la nueva
      quedó lista (edge case de `spec.md`) en `tests/e2e/vehiculos.spec.ts`

      **Estado**: confirmado en rojo (4/4 fallan, `foto-input` no existe todavía).

### Implementation for Foto del vehículo

- [X] T061 Extender `app/composables/useVehiculos.ts`: `adjuntarFoto(vehiculoId, archivo)` — sube
      a `documentos/foto/{empresa_id}/{vehiculo_id}/{archivo}` (mismo helper de nombre único de
      `archivos.ts`), inserta la fila en `archivos` (`tipo: 'foto'`), actualiza
      `vehiculos.foto_archivo_id`, y solo **después** de que el nuevo puntero quedó guardado
      exitosamente, si había una foto anterior, borra su fila en `archivos` y su objeto en
      Storage (orden importa: nunca borrar la vigente antes de confirmar la nueva, T060).
- [X] T062 Extender `app/components/vehiculos/FormularioVehiculo.vue`: zona de adjuntar/reemplazar
      foto (mismo patrón de dropzone accesible que `poliza-dropzone`, con su propio
      `data-testid="foto-input"`), validación de tipo/tamaño vía `archivos.ts` antes de subir
      (T059); el componente emite el archivo de foto seleccionado junto con el de póliza al
      enviar el formulario (ampliar la firma del evento `enviar`).
- [X] T063 Conectar la foto en `app/pages/admin/vehiculos/nuevo.vue` y
      `app/pages/admin/vehiculos/[id]/editar.vue` (T054): llamar `adjuntarFoto` tras
      `crear`/`editar`, best-effort — un fallo en la subida de la foto NO MUST bloquear ni
      revertir el alta/edición ya guardada (mismo criterio que la póliza, FR-005/T060).
- [X] T064 Mostrar la foto vigente (o un estado vacío con ícono genérico si no tiene) en la vista
      de detalle de solo lectura (`[id].vue`, T053).

      **Estado de la fase**: 4/4 tests de foto en verde a la primera corrida. Suite completa
      (`vehiculos.spec.ts` + `rls.spec.ts`, 78 pruebas totales incluyendo T050-T064): 77/78 en
      verde; el único fallo (T041, ajena a esta fase) es la misma flake de contención bajo carga
      ya documentada en "Regresión final entre features" — confirmada no reproducible en
      aislamiento. La foto vigente se resuelve como URL firmada (mismo mecanismo que la
      descarga de póliza) y se muestra en la pestaña "Datos" del detalle de solo lectura.
      `typecheck`/`lint` limpios. **Corrección propia durante la fase**: la primera regeneración
      de `database.types.ts` (`supabase gen types typescript --local > archivo 2>&1`) mezcló el
      orden de redirección de shell y dejó texto del CLI (`Connecting to db...`, aviso de nueva
      versión) al inicio del archivo, rompiendo el parseo de ESLint — detectado por `yarn lint` y
      corregido regenerando sin el `2>&1` antes del `>`.

**Checkpoint**: Foto del vehículo funcional, probada de forma independiente. La limpieza al
eliminar un vehículo (FR-016a, US-3.5) no requiere cambios — `eliminar()` en `useVehiculos.ts` ya
borra todas las filas de `archivos` del vehículo sin importar su `tipo`, así que una foto vigente
se limpia junto con el historial de póliza automáticamente. **Verificado** directamente vía REST
con `service_role` (sembrar vehículo + `archivos` con `tipo: 'foto'` + `foto_archivo_id` →
eliminar el vehículo → repetir la misma consulta `entidad_tipo=vehiculo&entidad_id=:id` que usa
`eliminar()`): la fila de tipo `foto` sigue apareciendo tras borrar el vehículo, confirmando que
el paso de limpieza de `archivos` la habría alcanzado igual que a las de `poliza` — fila de
prueba limpiada manualmente después.

---

## Fase agregada por segunda ronda de `/speckit-clarify` (sesión 2026-08-08)

El usuario revisó la Fase 10 ya implementada contra el mockup (`detalle-vehiculo-datos-generales.png`)
y señaló dos brechas: (1) el detalle de solo lectura usaba una sola tarjeta con todos los campos
en cuadrícula, sin la agrupación en tarjetas del mockup; (2) VIN/Kilometraje/Combustible/
Transmisión del mockup no existían en el modelo — se habían asumido fuera de alcance sin una
decisión explícita. `/speckit-clarify` resolvió ambas: agrupar en 4 tarjetas (FR-026) y agregar
los 4 campos como columnas opcionales de `vehiculos` (FR-001 ampliado) — "Conductor Asignado"/
"Último Mantenimiento" del mockup siguen fuera de alcance (dependen de features que no existen).

## Phase 12: Campos adicionales del vehículo y detalle agrupado en tarjetas (FR-001, FR-026 — cruza US1, US3, US7)

**Goal**: Capturar VIN, kilometraje actual, combustible y transmisión (opcionales) en alta/edición,
y reorganizar el detalle de solo lectura en 4 tarjetas siguiendo el mockup de Stitch en vez de una
cuadrícula plana.

**Independent Test**: Dar de alta un vehículo capturando los 4 campos nuevos y confirmar que
aparecen en la tarjeta correcta de su detalle; confirmar que las 4 tarjetas ("Identificación del
Vehículo", "Registro y Seguimiento", "Especificaciones Técnicas", "Seguro y Póliza") existen y
agrupan los campos según FR-026.

**Depende de US1** (formulario de alta), **US3** (formulario de edición) **y US7** (vista de
detalle a reestructurar, Fase 10) — mismo criterio de dependencia que la Fase 11 (Foto).

### Foundational para esta fase

- [X] T065 Crear una migración nueva (`supabase migration new vehiculos_campos_adicionales`):
      `alter table public.vehiculos add column vin text`, `add column kilometraje_actual
      numeric`, `add column combustible text`, `add column transmision text` — las 4 nullable
      (opcionales, Clarifications sesión 2026-08-08). Aplicar (`supabase migration up`),
      regenerar `app/types/database.types.ts` (`supabase gen types typescript --local > archivo`
      — **sin** `2>&1` antes del `>`, lección de la Fase 11), y actualizar `data-model.md`
      (tabla `vehiculos`: 4 columnas nuevas) y `contracts/vehiculos.md` si el contrato de
      alta/edición necesita mencionarlas explícitamente.

      **Verificado**: migración `20260809024839_vehiculos_campos_adicionales.sql` aplicada sin
      error; `database.types.ts` regenerado con las 4 columnas presentes en `Row`/`Insert`/
      `Update` de `vehiculos`; `typecheck`/`lint` limpios. `data-model.md` actualizado.

### Tests for Campos adicionales y detalle agrupado

- [X] T066 [P] [US1] Playwright: alta capturando VIN, kilometraje actual, combustible y
      transmisión deja esos datos visibles en el detalle del vehículo en
      `tests/e2e/vehiculos.spec.ts`
- [X] T067 [P] [US7] Playwright: el detalle de solo lectura agrupa los campos en las 4 tarjetas
      de FR-026 — verificar que "Identificación del Vehículo" contiene la foto y
      marca/modelo/año/color/tipo, "Registro y Seguimiento" contiene placa/VIN/número de
      serie/número de motor/kilometraje, "Especificaciones Técnicas" contiene
      combustible/transmisión/ejes/capacidad de carga, y "Seguro y Póliza" contiene
      aseguradora/número de póliza/vencimiento, en `tests/e2e/vehiculos.spec.ts`
- [X] T068 [P] [US3] Playwright: editar VIN, kilometraje actual, combustible y/o transmisión de
      un vehículo existente guarda los cambios y se reflejan en el detalle en
      `tests/e2e/vehiculos.spec.ts`

      **Estado**: confirmado en rojo (3/3 fallan — campos VIN/Kilometraje/Combustible/
      Transmisión no existen en el formulario todavía, y las tarjetas de FR-026 no existen en
      `[id]/index.vue`).

### Implementation for Campos adicionales y detalle agrupado

- [X] T069 Extender `app/components/vehiculos/FormularioVehiculo.vue`: agregar campos VIN
      (texto), Kilometraje actual (número), Combustible (texto), Transmisión (texto) — todos
      opcionales — en la tarjeta "Datos del vehículo"; incluirlos en `payload` al emitir
      `enviar` (los 4 ya llegan tipados en `VehiculoValores` una vez regenerado
      `database.types.ts` en T065, sin cambios de composable necesarios en `useVehiculos.ts`).
- [X] T070 Reestructurar `app/pages/admin/vehiculos/[id]/index.vue`: reemplazar la tarjeta única
      `datos-vehiculo` (cuadrícula plana) por 4 `v-card` agrupadas según FR-026, cada una con su
      propio `data-testid` (p. ej. `tarjeta-identificacion`, `tarjeta-registro`,
      `tarjeta-especificaciones`, `tarjeta-seguro-poliza`); la foto (T064, Fase 11) se integra
      dentro de "Identificación del Vehículo" en vez de flotar sola arriba de la cuadrícula.

      **Estado de la fase**: 3/3 tests de Fase 12 en verde a la primera corrida (T066-T068).
      Suite completa (`vehiculos.spec.ts` + `rls.spec.ts`, 42 pruebas): 41/42 en verde en la
      primera pasada; el único fallo (T011, ajena a esta fase) es la misma flake de contención
      bajo carga ya documentada — confirmada no reproducible en aislamiento (pasa consistente al
      correrla sola). `datos-vehiculo` se movió del `v-card` original al `v-window-item`
      contenedor (ahora envuelve las 4 tarjetas nuevas), preservando los `getByTestId
      ('datos-vehiculo')` de T050/T052 sin cambios. `typecheck`/`lint` limpios.

**Checkpoint**: Campos adicionales y detalle agrupado en tarjetas funcionando, probados de forma
independiente sobre US1/US3/US7 ya construidas. No afecta Foto (Fase 11) ni ninguna historia
anterior — solo agrega campos y reorganiza el layout de una tarjeta ya existente.

**Ajuste post-implementación (feedback directo, sin nueva ronda de `/speckit-clarify`)**: tras ver
T070 en pantalla, se fusionó "Registro y Seguimiento" dentro de "Identificación del Vehículo" (ya
no es su propia tarjeta) y "Seguro y Póliza" tomó su lugar en la columna derecha — 3 tarjetas en
vez de 4, menos scroll. `tarjeta-registro` ya no existe; sus campos (placa, VIN, número de serie,
número de motor, kilometraje) ahora viven dentro de `tarjeta-identificacion`. T067/T066/T068
actualizados para reflejarlo. De paso se corrigió un bug real de espaciado encontrado en el mismo
repaso: `.text-body-main`/`.text-label-caps` (y las otras 3 clases de tipografía de
`main.css`) heredaban el margen por defecto del navegador en `<p>` (`1em`, ~16px) al no tener
`margin` propio — corregido con un reset a `margin: 0` en las 5 clases (son tokens de
tipografía, no de layout) más un `mt-2` (8px) explícito entre cada par etiqueta/valor en el
detalle. `spec.md` (FR-026, User Story 7) actualizado. Verificado: 32/33 en
`vehiculos.spec.ts --project=admin` (el único fallo, T037, es una flake ya conocida y ajena a
este cambio — confirmada no reproducible en aislamiento). `typecheck`/`lint` limpios.

---

## Fase agregada — Historial de Pólizas rediseñado (feedback directo, sesión 2026-08-09)

Tras revisar el nuevo mockup de Stitch `detalle-vehiculo-historial-polizas.png`
(`docs/design-references/screens.md`), se rediseñó la pestaña "Historial de Póliza" del detalle
de vehículo: de una `v-list` simple a una tabla (`v-table`) con columnas Versión/Fecha, Estado,
Subido por y Acciones, más la capacidad de subir una nueva versión directo desde esa pestaña
(spec.md FR-011, FR-011a, User Story 3 escenario 4). No requirió una ronda formal de
`/speckit-clarify` — se resolvió con `AskUserQuestion` si el botón "Subir Nueva Póliza" del
mockup debía implementarse también (sí) antes de tocar código, dado que es una capacidad nueva y
no solo un cambio visual.

### Implementation

- [X] T071 Agregar `verArchivo(storagePath)` a `app/composables/useVehiculos.ts`: igual que
      `descargarArchivo` pero sin la opción `download`, para que el botón "Ver" abra la versión en
      una pestaña nueva (`window.open`) sin forzar `Content-Disposition: attachment`.
- [X] T072 Reescribir `app/components/vehiculos/HistorialPoliza.vue`: `v-table` en vez de
      `v-list`, título "Historial de Pólizas de Seguro", chip de estado por fila ("Vigente" /
      "Anterior" — no "Vencida", porque el modelo de datos no guarda vencimiento por versión, solo
      para la póliza vigente del vehículo), acciones "Ver" y "Descargar", y un diálogo "Subir
      Nueva Póliza" (mismo dropzone y `validarArchivo` que `FormularioVehiculo.vue`, reutiliza
      `adjuntarPoliza` del composable); emite `subida` para que la página padre refresque
      `vehiculo.poliza_archivo_id`.
- [X] T073 Conectar el evento en `app/pages/admin/vehiculos/[id]/index.vue`
      (`@subida="cargar"`) y actualizar `docs/design-references/screens.md` con la nueva
      referencia descargada de Stitch.

### Tests

- [X] T025/T026 actualizados: contenedor renombrado de `historial-poliza-lista` a
      `historial-poliza-tabla`; `vigente-badge-${id}` reemplazado por `estado-${id}` (ahora
      presente en todas las filas, no solo en la vigente).
- [X] T074 [P] "Ver" dispara la request de la URL firmada sin el parámetro `download=` (a
      diferencia de "Descargar") — verificado interceptando la request en vez de inspeccionar la
      pestaña nueva: Chromium headless descarga la respuesta `application/pdf` en vez de
      navegarla, dejando la `page` del popup sin URL utilizable para el assert.
- [X] T075 [P] "Subir Nueva Póliza" desde el historial agrega una fila nueva marcada "Vigente" y
      degrada la anterior a "Anterior".

**Estado de la fase**: 35/35 en `vehiculos.spec.ts --project=admin` (incluye T037, sin flake esta
corrida). `typecheck`/`lint` limpios.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede correr en paralelo con Foundational.
- **Foundational (Phase 2)**: sin dependencias de Setup, pero BLOQUEA las 6 historias de usuario.
- **User Stories (Phase 3–8, 10)**: todas dependen de Foundational. A diferencia de Catálogos
  Base, **no todas son independientes entre sí** — ver la cadena de dependencias abajo.
- **Polish (Phase 9)**: depende de que las historias que se vayan a entregar estén completas.
- **Foto del vehículo (Phase 11)**: agregada en una ronda posterior de `/speckit-clarify`; depende
  de US1, US3 y US7 (Phase 10), no de Polish (Phase 9, ya cerrada para el alcance original).
- **Campos adicionales y detalle agrupado (Phase 12)**: agregada en una tercera ronda de
  `/speckit-clarify`; depende de US1, US3 y US7 igual que Foto (Phase 11), pero es independiente
  de Foto — ambas fases pueden avanzar en cualquier orden entre sí.

### User Story Dependencies

- **US1 (P1)**: solo depende de Foundational. Crea `FormularioVehiculo.vue`, reusado por US3.
- **US2 (P1)**: solo depende de Foundational. Crea `index.vue`, base para el botón de eliminar de
  US5. Puede avanzar en paralelo con US1 (útil probarla sembrando datos vía `service_role` antes
  de que US1 exista, igual que T012 de Catálogos Base).
- **US3 (P2)**: depende de **US1** (reusa `FormularioVehiculo.vue`). Crea `[id].vue`, base para
  US4 y US6.
- **US4 (P2)**: depende de **US3** (usa `[id].vue` ya creada).
- **US5 (P3)**: depende solo de **US2** (el botón de eliminar vive en `index.vue`) — independiente
  de US3/US4/US6, puede construirse justo después del MVP si se prioriza así.
- **US6 (P3)**: depende de **US3** (usa la pestaña "Permisos" de `[id].vue`, placeholder desde
  T028) y de que exista al menos un permiso en el catálogo de Catálogos Base.
- **US7 (P2, agregada post-`/speckit-clarify`)**: depende de **US1** y **US3**. Reestructura
  `[id].vue` (de US3) en vista de solo lectura y mueve el formulario a `[id]/editar.vue` — US4 y
  US6, que ya viven en `[id].vue`, no deberían necesitar cambios propios, pero sus tests deben
  seguir pasando después de este cambio de estructura.
- **Foto del vehículo (agregada post-`/speckit-clarify`, sin número de historia — cruza US1, US3,
  US7)**: depende de que las tres ya estén completas; no depende de US4/US5/US6.
- **Campos adicionales y detalle agrupado (agregada en tercera ronda de `/speckit-clarify`, sin
  número de historia — cruza US1, US3, US7)**: misma dependencia que Foto; independiente de Foto
  entre sí (pueden ir en cualquier orden relativo, o en paralelo si hay más de un desarrollador).

Orden de implementación sugerido que respeta esta cadena: **US1 → US2 → US3 → (US4 y US5 en
paralelo) → US6 → US7 → (Foto del vehículo y Campos adicionales, en cualquier orden o en
paralelo)**.

### Within Each User Story

- Tests antes que implementación (deben fallar antes de implementar).
- Componentes reusables antes que la página que los usa.
- Página base (`[id].vue` en US3) antes que las pestañas que otras historias le agregan (US4,
  US6).

### Parallel Opportunities

- T009, T010 (Foundational) — `archivos.ts` y `useVehiculos.ts` tocan archivos distintos, pero
  `useVehiculos.ts` internamente usa `archivos.ts`; pueden escribirse en paralelo si se acuerda
  la firma de `archivos.ts` primero (o secuencial si un solo desarrollador).
- Dentro de cada historia, todas las tareas de test marcadas [P] pueden dispararse juntas.
- US1 y US2 pueden avanzar en paralelo entre sí (ambas dependen solo de Foundational).
- US4 y US5 pueden avanzar en paralelo entre sí una vez completa US3 (US4 depende de US3; US5 no,
  pero no hay conflicto de archivos entre ambas).
- T046, T047, T048 (Polish) son independientes entre sí.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de US1 juntos:
Task: "Playwright: alta sin póliza en tests/e2e/vehiculos.spec.ts"
Task: "Playwright: alta con póliza adjunta en tests/e2e/vehiculos.spec.ts"
Task: "Playwright: alta rechazada por placa duplicada en tests/e2e/vehiculos.spec.ts"
Task: "Playwright: archivo con tipo/tamaño inválido rechazado en tests/e2e/vehiculos.spec.ts"
Task: "Playwright: fallo de subida no revierte el alta en tests/e2e/vehiculos.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)

1. Completar Phase 1: Setup (referencias Stitch)
2. Completar Phase 2: Foundational (CRÍTICO — bloquea las 6 historias)
3. Completar Phase 3: User Story 1 (alta)
4. Completar Phase 4: User Story 2 (listado y búsqueda)
5. **DETENER Y VALIDAR**: probar US1+US2 juntas de forma independiente (quickstart.md Escenarios
   1-2)
6. Desplegar/demo si está listo — ya es un catálogo de vehículos usable, aunque sin edición,
   baja, eliminación ni permisos todavía

### Incremental Delivery

1. Setup + Foundational → fundación lista (incluye el bucket de Storage, la pieza más nueva del
   proyecto)
2. US1 + US2 → probar juntas → demo (MVP)
3. US3 (edición + historial de póliza) → probar → demo
4. US4 (baja/reactivación) → probar → demo
5. US5 (eliminación con limpieza) → probar → demo (puede ir en paralelo con US4, ver arriba)
6. US6 (permisos asignados) → probar → demo
7. Polish: RLS negativo, aislamiento de Storage, accesibilidad, auditoría de punta a punta
8. **(agregado post-`/speckit-clarify`)** US7 (vista de detalle de solo lectura) → probar → demo
9. **(agregado post-`/speckit-clarify`)** Foto del vehículo → probar → demo
10. **(agregado en tercera ronda de `/speckit-clarify`)** Campos adicionales (VIN, kilometraje,
    combustible, transmisión) y detalle agrupado en tarjetas → probar → demo

### Parallel Team Strategy

Con más de un desarrollador: Setup + Foundational juntos (el bucket de Storage y
`useVehiculos.ts` son compartidos, conviene que los revise una sola persona). Después: una
persona en US1, otra en US2 en paralelo; luego una persona en US3 mientras otra ya prepara US5
(solo depende de US2); US4 y US6 esperan a que US3 termine `[id].vue`.

---

## Notes

- [P] = archivos distintos o casos de prueba independientes en el mismo spec, sin dependencias
  pendientes entre sí.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- A diferencia de Catálogos Base, varias historias SÍ dependen entre sí por compartir página
  (`[id].vue`) — respetar el orden de la sección "Dependencies" en vez de asumir independencia
  total.
- Verificar que los tests fallan antes de implementar.
- Hacer commit después de cada tarea o grupo lógico.
- Detenerse en cada checkpoint para validar la historia de forma independiente.
- Evitar: tareas vagas, conflictos de mismo archivo sin serializar, reintroducir bugs ya
  encontrados y corregidos en Catálogos Base (ver "Lecciones de Catálogos Base" al inicio).
- T050-T064 (Fases 10-11) se agregaron en una ronda posterior de `/speckit-tasks`, después de que
  el usuario señaló brechas contra el mockup de Stitch vía `/speckit-clarify`. `checklists/
  requirements.md` no se re-validó como parte de este comando (esa validación vive en
  `/speckit-clarify`, ya corrida) — sigue en 16/16 sin cambios de estado.
- T065-T070 (Fase 12) se agregaron en una tercera ronda, tras una segunda pasada de
  `/speckit-clarify` sobre la Fase 10 ya implementada (el detalle de solo lectura no reflejaba el
  mockup de referencia). Mismo criterio que T050-T064: no se regeneró `tasks.md`, se anexó.
