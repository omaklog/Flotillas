# Feature Specification: Conductores

**Feature Branch**: `004-conductores`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Feature 004 — Conductores. Reusa el patrón ya probado en Vehículos (003): subida de archivo en dos pasos al bucket documentos, desactivación con motivo, listado con filtro de ocultos por defecto. No depende de Feature 005 (Asignación Conductor-Vehículo) — es al revés, 005 depende de que esta exista. CRUD completo de conductores: alta con licencia adjunta, búsqueda, edición, desactivación (no eliminación física salvo sin dependientes)."

## Resumen

Esta feature administra el catálogo de conductores de la flotilla: alta con archivo de licencia
adjunto, listado con búsqueda, edición (incluyendo reemplazo de licencia con historial de
versiones), desactivación/reactivación como estado separado de la eliminación física. No depende
de ninguna feature previa más allá de Autenticación (001); es la base sobre la que se construirá
Asignación Conductor-Vehículo (005). Reutiliza directamente los patrones ya validados en Vehículos
(003): bucket privado `documentos`, alta en dos pasos, desactivación con motivo obligatorio,
detalle de solo lectura con historial de versiones de archivo en tabla.

## Clarifications

### Session 2026-08-09

- Q: US-6 (eliminación de conductor) depende de que exista `asignaciones_conductor_vehiculo` para
  poder rechazar la eliminación de un conductor con asignaciones. Esa tabla está pre-diseñada
  (con FK a `conductores`, sin `ON DELETE CASCADE`) pero aún no aplicada — ¿se aplica esa
  migración como parte del trabajo fundacional de esta feature, o queda pendiente para Feature
  005? → A: Se aplica ahora, como parte del trabajo fundacional de esta feature (solo la tabla y
  sus restricciones — sin ninguna UI para crear/gestionar asignaciones, eso sigue siendo alcance
  exclusivo de Feature 005). Esto deja el escenario de rechazo de US-6 completamente probable de
  punta a punta desde esta misma feature.

## Actores

- **Administrador**: acceso completo (alta, edición, desactivación/reactivación, eliminación)
  sobre los conductores de su propia empresa.
- **Operario**: acceso de solo lectura (`ver`) por defecto (ya sembrado por Feature 001); no
  puede escribir salvo permiso explícito otorgado en `usuario_permisos` para el módulo
  `conductores`.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Storage — mismo bucket y patrón de dos pasos que Vehículos**: la licencia de un conductor
  vive en el mismo bucket privado `documentos`, en la ruta
  `documentos/licencia/{empresa_id}/{conductor_id}/{archivo}`. Por la misma dependencia circular
  que en Vehículos (el archivo necesita el id del conductor; el conductor necesita el id del
  archivo para su columna de licencia vigente), el alta ocurre en dos pasos: (1) se crea el
  conductor sin archivo; (2) ya con su id, se sube el documento y se vincula como licencia
  vigente. Si el paso 2 falla, el conductor queda creado sin licencia adjunta — el alta completa
  no se pierde por un error de subida; el administrador puede adjuntarla después editando el
  registro. Tipos de archivo permitidos: PDF o imagen (`.pdf`, `.jpg`, `.jpeg`, `.png`); tamaño
  máximo 10 MB — mismos límites que Vehículos.
- **Desactivación como acción separada, no un campo del formulario de edición**: desactivar un
  conductor es una acción dedicada (no un interruptor dentro de "Editar") que exige capturar un
  motivo (texto obligatorio, máximo 150 caracteres) antes de confirmar. Un conductor desactivado
  puede reactivarse; el motivo queda en el historial de auditoría, no se pierde al reactivar. El
  listado de conductores oculta los inactivos por defecto, con un control explícito para
  mostrarlos.
- **Número de licencia único por empresa**: mismo criterio que la placa en Vehículos —
  `UNIQUE(empresa_id, numero_licencia)`, validado tanto en el formulario antes de enviar como de
  respaldo en base de datos.
- **Reemplazar la licencia conserva el historial**: subir un nuevo archivo de licencia no borra
  el anterior — ambos quedan como registros en el catálogo de archivos de la empresa; el
  conductor solo actualiza a cuál de ellos apunta como "vigente". El historial completo de
  versiones queda visible en el detalle del conductor, en el mismo formato de tabla (fecha,
  quién subió, acciones "Ver"/"Descargar", etiqueta de estado) y con la misma capacidad de subir
  una nueva versión directo desde esa sección, ya construidos en Vehículos (003) — esta feature
  parte directo de esa versión madura del patrón, sin repetir su iteración inicial (lista simple
  sin acción de subida).
- **Detalle de solo lectura, separado de la edición**: el detalle de un conductor MUST ser una
  vista de solo lectura por defecto, con una acción explícita ("Editar") que lleva al formulario
  editable — no un clic directo del listado al formulario. El historial de licencia vive dentro
  de este mismo detalle, en una sección o pestaña separada de los datos generales. Esta feature
  construye ese patrón desde el inicio (a diferencia de Vehículos, que lo corrigió después de un
  primer intento distinto).
- **Eliminación física bloqueada por dependientes ya garantizada en base de datos** (Clarifications,
  sesión 2026-08-09): igual que en Vehículos y Catálogos Base, la protección real vive en la
  relación con `asignaciones_conductor_vehiculo` — esta feature solo captura ese rechazo y lo
  traduce a un mensaje claro, no reimplementa la validación. A diferencia de Vehículos (donde esa
  tabla dependiente ya existía de features previas), aquí la tabla `asignaciones_conductor_vehiculo`
  todavía no existe en el esquema aplicado: esta feature MUST crearla como parte de su trabajo
  fundacional (ya prediseñada en `docs/schema-reference/schema_06_asignaciones_conductor_vehiculo.sql`
  — FK a `conductores` sin `ON DELETE CASCADE`, índice único de "un vehículo, una asignación activa
  a la vez"), sin construir ninguna UI para crear o gestionar asignaciones — eso permanece como
  alcance exclusivo de Feature 005.
- **Eliminar un conductor también limpia su historial de licencia**: como `archivos` no tiene una
  foreign key real hacia `conductores` (la relación es polimórfica vía `entidad_id`), no hay
  borrado en cascada automático a nivel de base de datos — esta feature MUST borrar
  explícitamente los registros de `archivos` y los objetos de Storage asociados al conductor como
  parte de la misma operación de eliminación, para no dejar huérfanos (mismo criterio que
  Vehículos).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrador da de alta un conductor (Priority: P1)

Como administrador, quiero registrar un nuevo conductor con sus datos personales, número de
licencia y, opcionalmente, el archivo de su licencia, para poder asignarlo después a un vehículo.

**Why this priority**: Sin conductores registrados, no existe la entidad base sobre la que se
construirá la asignación conductor-vehículo (Feature 005); es el primer paso indispensable.

**Independent Test**: Completar el formulario de alta con los campos obligatorios y confirmar que
el conductor aparece en el listado.

**Acceptance Scenarios**:

1. **Given** el formulario de alta de conductor, **When** el administrador captura nombre,
   apellidos, número de licencia, tipo de licencia y fecha de vencimiento (sin adjuntar licencia)
   y guarda, **Then** el conductor se crea sin archivo de licencia.
2. **Given** el formulario de alta, **When** el administrador además adjunta un archivo de
   licencia válido (PDF, JPG o PNG, hasta 10 MB) y guarda, **Then** el conductor se crea con esa
   licencia como vigente.
3. **Given** un número de licencia ya registrado en la empresa, **When** el administrador intenta
   dar de alta otro conductor con el mismo número, **Then** el sistema lo rechaza antes de enviar
   el formulario, indicando que ya está en uso.

---

### User Story 2 - Administrador busca y consulta el listado de conductores (Priority: P1)

Como administrador, quiero ver el listado de conductores de mi empresa y buscar por nombre, para
ubicar rápidamente a un conductor específico.

**Why this priority**: Es el punto de entrada para todas las demás acciones (ver detalle, editar,
desactivar, eliminar); sin listado no hay forma de localizar un conductor ya creado.

**Independent Test**: Dar de alta varios conductores y confirmar que el buscador filtra
correctamente por nombre.

**Acceptance Scenarios**:

1. **Given** varios conductores activos en la empresa, **When** el administrador abre el listado,
   **Then** ve a todos los conductores activos, cada uno con un indicador visual del estado de su
   licencia (vencida, por vencer o vigente).
2. **Given** el listado de conductores, **When** el administrador escribe parte de un nombre en el
   buscador, **Then** el listado se filtra a los conductores cuyo nombre completo coincide.
3. **Given** un conductor desactivado, **When** el administrador abre el listado sin activar el
   filtro "Mostrar inactivos", **Then** ese conductor no aparece.

---

### User Story 3 - Administrador consulta el detalle de un conductor sin entrar a edición (Priority: P2)

Como administrador, quiero abrir el detalle de un conductor en modo de solo lectura, con una
acción explícita para editar, para poder revisar su información sin riesgo de modificarla por
error.

**Why this priority**: Consultar datos es una acción mucho más frecuente que editarlos; mezclar
ambas en la misma vista aumenta el riesgo de cambios accidentales.

**Independent Test**: Abrir el detalle de un conductor desde el listado y confirmar que ningún
campo es editable hasta hacer clic en "Editar".

**Acceptance Scenarios**:

1. **Given** un conductor existente, **When** el administrador lo abre desde el listado, **Then**
   ve sus datos en modo de solo lectura, sin campos editables.
2. **Given** el detalle de un conductor, **When** el administrador hace clic en "Editar", **Then**
   se muestra el formulario editable con los datos precargados.

---

### User Story 4 - Administrador edita un conductor y gestiona el historial de su licencia (Priority: P2)

Como administrador, quiero corregir o actualizar los datos de un conductor y reemplazar el
archivo de su licencia cuando se renueva, sin perder acceso a las versiones anteriores.

**Why this priority**: Los datos de un conductor (celular, domicilio, vigencia de licencia)
cambian con el tiempo; sin edición, un error de captura o una renovación obligaría a desactivar y
crear un conductor nuevo, perdiendo su historial.

**Independent Test**: Editar un conductor existente cambiando uno de sus campos y confirmar que
se guarda; reemplazar su archivo de licencia y confirmar que el anterior sigue disponible en el
historial, marcado como no vigente.

**Acceptance Scenarios**:

1. **Given** un conductor existente, **When** el administrador edita cualquiera de sus campos y
   guarda, **Then** los cambios se reflejan sin afectar otros registros.
2. **Given** un conductor con una licencia ya adjunta, **When** el administrador sube un nuevo
   archivo de licencia, **Then** el nuevo archivo queda como la licencia vigente y el anterior
   sigue existiendo, visible en el historial de versiones del conductor.
3. **Given** un conductor con más de una versión de licencia en su historial, **When** el
   administrador abre esa sección del detalle, **Then** ve cada versión en una tabla con su fecha
   de subida, quién la subió, una acción "Ver" para previsualizarla, una acción "Descargar", y una
   etiqueta de estado que indica si es la vigente o una versión anterior.
4. **Given** el detalle de un conductor, **When** el administrador usa una acción "Subir Nueva
   Licencia" directamente desde esa sección del historial (sin pasar por Editar), **Then** el
   nuevo archivo queda como vigente y la versión anterior pasa a marcarse como anterior.

---

### User Story 5 - Administrador desactiva y reactiva un conductor (Priority: P2)

Como administrador, quiero desactivar un conductor que ya no está disponible para operar (sin
eliminar su historial), y poder reactivarlo si vuelve a estar disponible.

**Why this priority**: Un conductor puede dejar de estar disponible temporal o permanentemente
sin que deba perderse su información ni su historial.

**Independent Test**: Desactivar un conductor capturando un motivo y confirmar que desaparece del
listado por defecto; reactivarlo y confirmar que vuelve a aparecer.

**Acceptance Scenarios**:

1. **Given** un conductor activo, **When** el administrador hace clic en "Desactivar" sin
   capturar un motivo, **Then** el sistema bloquea la confirmación hasta que se capture uno.
2. **Given** un conductor activo, **When** el administrador captura un motivo válido y confirma
   la desactivación, **Then** el conductor deja de aparecer en el listado por defecto.
3. **Given** un conductor desactivado, **When** el administrador hace clic en "Reactivar", **Then**
   el conductor vuelve a aparecer en el listado por defecto, conservando el motivo de su
   desactivación anterior en el historial de auditoría.

---

### User Story 6 - Administrador elimina definitivamente un conductor sin dependientes (Priority: P3)

Como administrador, quiero eliminar por completo un conductor capturado por error o que nunca
llegó a operar, cuando no tiene asignaciones registradas.

**Why this priority**: Es una acción poco frecuente (la mayoría de los casos se resuelven con
desactivación) y de menor prioridad que el resto del CRUD.

**Independent Test**: Eliminar un conductor sin asignaciones y confirmar que desaparece por
completo, incluida su licencia; intentar eliminar uno con asignaciones y confirmar que se
rechaza con un mensaje claro.

**Acceptance Scenarios**:

1. **Given** un conductor sin asignaciones registradas, **When** el administrador lo elimina,
   **Then** el conductor y todo su historial de archivos de licencia desaparecen por completo.
2. **Given** un conductor con al menos una asignación registrada en
   `asignaciones_conductor_vehiculo` (Clarifications, sesión 2026-08-09 — la tabla se crea como
   parte del trabajo fundacional de esta feature), **When** el administrador intenta eliminarlo,
   **Then** el sistema rechaza la eliminación con un mensaje explícito, sin exponer detalles
   técnicos del error.

---

### Edge Cases

- ¿Qué pasa si dos administradores intentan dar de alta el mismo número de licencia al mismo
  tiempo? El `UNIQUE` de base de datos rechaza el segundo intento, mostrando el mismo mensaje que
  la validación de duplicado del formulario.
- ¿Qué pasa si se intenta desactivar un conductor ya inactivo, o reactivar uno ya activo? La
  acción correspondiente no está disponible en ese estado (mismo criterio que Vehículos).
- ¿Qué pasa si la licencia adjunta vence mientras el conductor está inactivo? El indicador de
  vigencia se sigue calculando igual; estar inactivo no oculta ni congela ese estado.
- ¿Qué pasa si se elimina un conductor que tiene una licencia adjunta pero ninguna asignación? Se
  permite eliminar: se borran también sus archivos de licencia y los objetos correspondientes en
  Storage, igual que al eliminar un vehículo sin dependientes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El administrador MUST poder dar de alta un conductor capturando nombre, apellidos,
  celular, domicilio (número, calle, colonia), número de licencia (obligatorio), tipo de licencia
  (federal o local) y fecha de vencimiento de licencia.
- **FR-002**: El sistema MUST validar que el número de licencia capturado no esté ya en uso por
  otro conductor de la misma empresa, marcándolo en el formulario antes de enviar, además del
  `UNIQUE(empresa_id, numero_licencia)` de respaldo en base de datos.
- **FR-003**: El administrador MUST poder adjuntar un archivo de licencia (PDF o imagen) durante
  el alta, de forma opcional; si no lo adjunta en ese momento, MUST poder hacerlo después editando
  el conductor.
- **FR-004**: El sistema MUST rechazar archivos que no sean PDF, JPG o PNG, o que excedan 10 MB,
  antes de intentar subirlos.
- **FR-005**: Si la subida del archivo de licencia falla durante el alta, el sistema MUST
  conservar el conductor ya creado sin bloquear ni revertir el alta completa.
- **FR-006**: El sistema MUST proveer un listado de los conductores de la empresa del usuario, con
  buscador por nombre completo (nombre y apellidos).
- **FR-007**: El listado de conductores MUST ocultar por defecto los conductores inactivos, y
  MUST ofrecer un control explícito para incluirlos.
- **FR-008**: Cada conductor en el listado MUST mostrar un indicador visual del estado de su
  licencia: "vencida" si la fecha de vencimiento ya pasó, "por vencer" si faltan 60 días o menos
  para esa fecha, o "vigente" en cualquier otro caso (mismo umbral ya establecido para la póliza
  de vehículos).
- **FR-009**: El administrador MUST poder editar cualquier dato de un conductor existente,
  incluyendo los mismos campos capturados en el alta.
- **FR-010**: El administrador MUST poder reemplazar el archivo de licencia de un conductor; el
  archivo anterior NO MUST eliminarse — MUST permanecer disponible en el historial de versiones,
  y el conductor MUST quedar apuntando al nuevo archivo como su licencia vigente.
- **FR-011**: El detalle de un conductor MUST mostrar el historial completo de versiones de su
  licencia en una tabla (fecha de subida, quién la subió, acción "Ver" para previsualizar y acción
  "Descargar"), etiquetando cada fila como "Vigente" o "Anterior" según corresponda.
- **FR-011a**: El administrador MUST poder subir una nueva versión de la licencia directamente
  desde esa sección del historial (además de poder hacerlo vía Editar, FR-010) — misma validación
  de tipo/tamaño de archivo (FR-004) y mismo efecto: el nuevo archivo queda como vigente sin
  eliminar el anterior.
- **FR-012**: El administrador MUST poder desactivar un conductor mediante una acción dedicada que
  exige capturar un motivo de hasta 150 caracteres antes de confirmar; el sistema MUST impedir
  confirmar la desactivación sin ese motivo.
- **FR-013**: Un conductor desactivado MUST dejar de aparecer en el listado por defecto (FR-007),
  sin perder ninguno de sus datos ni su historial.
- **FR-014**: El administrador MUST poder reactivar un conductor desactivado, y esa acción MUST
  estar disponible solo para conductores que estén desactivados.
- **FR-015**: El administrador MUST poder eliminar definitivamente un conductor que no tenga
  registros dependientes en `asignaciones_conductor_vehiculo` (Clarifications, sesión 2026-08-09).
- **FR-016**: Al intentar eliminar un conductor con registros dependientes, el sistema MUST
  capturar el error de integridad referencial de la base de datos y mostrar un mensaje explícito
  indicando por qué no se puede eliminar, sin exponer detalles técnicos del error.
- **FR-016a**: Al eliminar definitivamente un conductor, el sistema MUST eliminar también todos
  los registros de `archivos` asociados a él (todo su historial de versiones de licencia) y los
  objetos correspondientes en Storage, como parte de la misma operación — no deben quedar
  registros ni archivos huérfanos.
- **FR-017**: Los archivos de licencia MUST almacenarse aislados por empresa: ningún usuario MUST
  poder acceder, listar ni descargar archivos pertenecientes a otra empresa.
- **FR-018**: Un operario sin permisos de escritura otorgados explícitamente en el módulo
  `conductores` MUST poder ver el listado, el detalle y el historial de licencia de los
  conductores de su empresa, pero NO MUST poder crear, editar, desactivar, reactivar ni eliminar
  conductores.
- **FR-019**: El detalle de un conductor MUST mostrarse por defecto en modo de solo lectura, sin
  campos editables; el sistema MUST proveer una acción explícita ("Editar") que lleva al
  formulario editable — el listado NO MUST llevar directo al formulario.

### Key Entities

- **Conductor**: entidad central de esta feature. Atributos: nombre, apellidos, celular,
  domicilio (número, calle, colonia), número de licencia (único por empresa), tipo de licencia
  (federal o local), fecha de vencimiento de licencia, referencia a su archivo de licencia
  vigente, estado activo/inactivo y motivo de desactivación. Será referenciado por Asignación
  Conductor-Vehículo (Feature 005, futura).
- **Archivo de licencia**: cada versión de licencia subida para un conductor. Mismo tipo de
  registro que el archivo de póliza en Vehículos (misma tabla `archivos`, tipo `licencia`).
  Atributos: ruta de almacenamiento, a qué conductor pertenece, quién lo subió, cuándo. Un
  conductor conserva todas sus versiones históricas; solo una a la vez es la vigente. Su ciclo de
  vida está ligado al del conductor: se elimina junto con él (FR-016a), no de forma independiente.

## Fuera de Alcance

- Asignación de un conductor a un vehículo — es Feature 005, que depende de que esta feature
  exista primero. Esta feature crea únicamente la tabla `asignaciones_conductor_vehiculo` y sus
  restricciones a nivel de base de datos (Clarifications, sesión 2026-08-09 — necesarias para que
  US-6 pueda probarse de punta a punta); no construye ninguna UI para crear, listar o gestionar
  asignaciones, ni la lógica de aplicación (advertencias de conductor ya asignado, cierre de
  asignación previa al reasignar) — todo eso sigue siendo alcance exclusivo de Feature 005.
- Mostrar al conductor como "responsable" en checklists, mantenimiento u otras features — pendiente
  hasta que esas features se especifiquen.
- **Alerta automática de vencimiento de licencia**: pertenece a una futura feature de
  Alertas/Dashboard (constitución §4, excepción documentada tras `/speckit-analyze` de esta
  feature) — mismo criterio ya aplicado a la póliza en Vehículos. Mientras esa feature no exista,
  el indicador visual de vigencia en el listado y el detalle (FR-008) es la única señal de
  vencimiento próximo; no hay notificación push, correo, ni ningún otro mecanismo activo.
- Impedir seleccionar un conductor desactivado al crear una asignación conductor-vehículo — es una
  regla de Feature 005, no de esta feature (que no construye asignaciones).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede dar de alta un conductor completo (con licencia adjunta) en
  menos de 3 minutos.
- **SC-002**: El 100% de los intentos de crear o editar un conductor con un número de licencia
  duplicado dentro de la misma empresa son detectados por el formulario antes de enviarse.
- **SC-003**: El 100% de los intentos de eliminar un conductor con registros dependientes son
  rechazados con un mensaje claro y comprensible, sin que el usuario vea un error técnico crudo.
- **SC-004**: Un fallo en la subida del archivo de licencia durante el alta nunca provoca la
  pérdida del conductor ya capturado — 100% de esos casos dejan el conductor creado sin licencia,
  no un alta fallida por completo.
- **SC-005**: Un administrador puede localizar un conductor específico dentro de un listado de
  hasta 100 conductores usando el buscador en menos de 10 segundos.
- **SC-006**: El 100% de las versiones anteriores de una licencia reemplazada siguen siendo
  accesibles desde el historial del conductor después del reemplazo.
- **SC-007**: Cero accesos exitosos de un usuario de una empresa a los archivos de licencia de
  otra empresa.

## Assumptions

- El campo `motivo_baja` y la restricción `UNIQUE(empresa_id, numero_licencia)` sobre
  `conductores` todavía no existen en el esquema actual (la tabla base ya tiene el resto de los
  campos: nombre, apellidos, celular, domicilio, número y tipo de licencia, fecha de vencimiento,
  referencia a archivo de licencia, estado activo). Se agregan como parte del trabajo fundacional
  de esta feature, igual que Vehículos agregó su propia restricción `UNIQUE` sobre `placa` en una
  migración dedicada.
- El módulo de permisos `conductores` y el valor `licencia` del catálogo de tipo de archivo ya
  existen en el esquema (tabla `modulos`, enum `tipo_archivo`) — no requieren cambios para esta
  feature.
- El detalle del conductor se construye desde el inicio como vista de solo lectura con un botón
  "Editar" explícito y el historial de licencia en formato de tabla con acciones "Ver" /
  "Descargar" / "Subir Nueva Licencia" — aplicando directamente la versión ya madura de ese patrón
  en Vehículos (003), sin repetir la iteración por la que pasó esa feature (de lista simple a
  tabla con subida directa).
- El buscador del listado incluye tanto `nombre` como `apellidos` (búsqueda por nombre completo),
  interpretación razonable de "buscador por nombre" para una entidad de persona.
- El umbral de "por vencer" para la licencia usa los mismos 60 días ya establecidos para la
  póliza de vehículos, por consistencia dentro de la misma aplicación.
- No existe todavía una referencia visual de Stitch específica para las pantallas de Conductores;
  se seguirá el mismo lenguaje visual de `docs/design-system.md` y los patrones de layout ya
  construidos en Vehículos (listado en tabla, detalle en tarjetas) hasta que exista una referencia
  propia.
- La tabla `asignaciones_conductor_vehiculo` (Clarifications, sesión 2026-08-09) se crea con la
  definición ya prediseñada en `docs/schema-reference/schema_06_asignaciones_conductor_vehiculo.sql`
  tal cual está, sin modificarla — esa definición no fue revisada ni cuestionada como parte de
  esta feature, solo se adopta para destrabar la prueba de punta a punta de US-6.
