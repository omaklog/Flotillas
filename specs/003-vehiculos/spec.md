# Feature Specification: Vehículos

**Feature Branch**: `003-vehiculos`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Feature 003 — Vehículos. Depende de Feature 002 (Catálogos Base) ya cerrada: usa tipos_vehiculo y aseguradoras como catálogos de selección. Primera feature que sube archivos a Supabase Storage — el patrón que define aquí se reusa en Conductores, Combustible y Mantenimiento. CRUD completo de vehículos: alta con póliza adjunta, búsqueda, edición, baja (no eliminación física salvo sin dependientes), y asignación de permisos aplicables por vehículo con su propia vigencia."

## Resumen

Esta feature administra el catálogo de vehículos de la flotilla: alta con archivo de póliza
adjunto, listado con búsqueda, edición (incluyendo reemplazo de póliza con historial de
versiones), baja/reactivación como estado separado de la eliminación física, y asignación de los
tipos de permiso aplicables a cada vehículo con su propia fecha de vencimiento. Depende de
Catálogos Base (002) para los desplegables de tipo de vehículo y aseguradora, y es la primera
feature que sube archivos a Supabase Storage — el patrón de carpetas y RLS que establece aquí lo
reutilizarán Conductores, Combustible y Mantenimiento.

## Clarifications

### Session 2026-08-08

- Q: ¿Qué pasa con el archivo de póliza y su historial de versiones (tabla `archivos`, objetos en
  Storage) cuando se elimina definitivamente un vehículo (US-3.5)? → A: Limpieza completa — al
  eliminar el vehículo se borran también sus registros en `archivos` y los objetos
  correspondientes en Storage; no quedan huérfanos.
- Q: ¿Cuántos días antes del vencimiento de la póliza debe un vehículo mostrarse como "por
  vencer" en el listado (FR-008)? → A: 60 días.
- Q: La referencia de Stitch (`detalle-vehiculo-datos-generales.png`) muestra una pantalla de
  detalle de solo lectura, separada de la edición (botón "Editar" explícito). La implementación
  actual combina ambas: el clic en el listado abre directo el formulario editable. ¿Cómo se
  resuelve? → A: Agregar una pantalla de detalle de solo lectura con un botón "Editar" explícito
  hacia el formulario, alineada con el mockup.
- Q: El mockup de detalle muestra una foto del vehículo en la tarjeta "Identificación del
  Vehículo", capacidad que no existe hoy (ni columna en `vehiculos` ni campo en el formulario).
  ¿Se agrega? → A: Sí, foto opcional, con el mismo patrón de Storage que la póliza (bucket
  `documentos`, nuevo valor `foto` en el enum `tipo_archivo`).
- Q: ¿La foto del vehículo necesita el mismo historial de versiones que la póliza? → A: No — solo
  la foto vigente; un puntero `foto_archivo_id` en `vehiculos` que se reemplaza al subir una
  nueva (el objeto anterior en Storage se elimina), sin conservar versiones anteriores.
- Q: La implementación de la vista de detalle de solo lectura (US-3.7) usa una sola tarjeta con
  todos los campos en una cuadrícula uniforme; el mockup (`detalle-vehiculo-datos-generales.png`)
  agrupa los datos en tarjetas separadas ("Identificación del Vehículo" con la foto,
  "Registro y Seguimiento") en dos columnas. ¿Se ajusta el layout para reflejar esa agrupación? →
  A: Sí — reorganizar en tarjetas agrupadas siguiendo el mockup (ver FR-026).
- Q: El mockup incluye VIN y Kilometraje Actual en "Registro y Seguimiento", y Combustible y
  Transmisión en "Especificaciones Técnicas" — atributos del vehículo que hoy no existen en el
  modelo. ¿Se agregan? → A: Sí, los 4 como columnas nuevas opcionales de `vehiculos` (texto libre
  para VIN/Combustible/Transmisión, numérico para Kilometraje) — datos intrínsecos del vehículo
  que no dependen de otras features, a diferencia de "Conductor Asignado" y "Último
  Mantenimiento" del mockup, que sí quedan fuera de alcance (dependen de Conductores/
  Mantenimiento, features que no existen todavía — ver "Fuera de Alcance").

## Actores

- **Administrador**: acceso completo (alta, edición, baja/reactivación, eliminación, asignación
  de permisos) sobre los vehículos de su propia empresa.
- **Operario**: acceso de solo lectura (`ver`) por defecto (ya sembrado por Feature 001); no
  puede crear, editar, dar de baja, eliminar ni asignar permisos salvo que el administrador le
  otorgue esos permisos explícitamente en el módulo `vehiculos`.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Storage — un solo bucket privado, subcarpetas por tipo y empresa**: todos los documentos del
  sistema (pólizas, licencias, facturas) viven en un único bucket privado `documentos`, nunca
  público. La ruta de cada archivo sigue el patrón
  `documentos/{tipo}/{empresa_id}/{entidad_id}/{archivo}`, donde `{tipo}` coincide con el
  catálogo ya definido en el esquema (`poliza`, `licencia`, `factura`); para esta feature,
  siempre `documentos/poliza/{empresa_id}/{vehiculo_id}/{archivo}`. El aislamiento por empresa se
  aplica igual que en las tablas normales, verificando el segmento de la ruta correspondiente a
  `empresa_id` contra la empresa de quien hace la solicitud. Tipos de archivo permitidos: PDF o
  imagen (`.pdf`, `.jpg`, `.jpeg`, `.png`); tamaño máximo 10 MB.
- **Alta en dos pasos**: por la dependencia circular entre el vehículo y su archivo de póliza
  (el archivo necesita el id del vehículo para su ruta; el vehículo necesita el id del archivo
  para su columna de póliza vigente), el alta ocurre en dos pasos: (1) se crea el vehículo sin
  archivo; (2) ya con su id, se sube el documento y se vincula como póliza vigente. Si el paso 2
  falla, el vehículo queda creado sin póliza adjunta — el alta completa no se pierde por un error
  de subida; el administrador puede adjuntarla después editando el registro.
- **Baja como acción separada, no un campo del formulario de edición**: dar de baja un vehículo
  es una acción dedicada (no un interruptor dentro de "Editar") que exige capturar un motivo
  (texto obligatorio, máximo 150 caracteres) antes de confirmar. Un vehículo dado de baja puede
  reactivarse; el motivo de la baja queda en el historial de auditoría, no se pierde al
  reactivar. El listado de vehículos oculta los dados de baja por defecto, con un control
  explícito para mostrarlos.
- **Reemplazar la póliza conserva el historial**: subir un nuevo archivo de póliza no borra el
  anterior — ambos quedan como registros en el catálogo de archivos de la empresa; el vehículo
  solo actualiza a cuál de ellos apunta como "vigente". El historial completo de versiones queda
  visible en el detalle del vehículo.
- **Eliminación física bloqueada por dependientes ya garantizada en base de datos**: igual que en
  Catálogos Base (002), la protección real vive en las relaciones existentes con cargas de
  combustible, mantenimientos, checklists y servicios obligatorios — esta feature solo captura
  ese rechazo y lo traduce a un mensaje claro, no reimplementa la validación.
- **Eliminar un vehículo también limpia su historial de póliza** (Clarifications, sesión
  2026-08-08): como `archivos` no tiene una foreign key real hacia `vehiculos` (la relación es
  polimórfica vía `entidad_id`), no hay borrado en cascada automático a nivel de base de datos —
  esta feature MUST borrar explícitamente los registros de `archivos` y los objetos de Storage
  asociados al vehículo como parte de la misma operación de eliminación, para no dejar huérfanos.
- **Detalle de solo lectura, separado de la edición** (Clarifications, sesión 2026-08-08): el
  detalle de un vehículo MUST ser una vista de solo lectura por defecto, con una acción explícita
  ("Editar") que lleva al formulario editable — no un clic directo del listado al formulario. El
  historial de póliza y los permisos asignados (US-3.3, US-3.6) viven dentro de este mismo
  detalle, en pestañas o secciones separadas de los datos generales.
- **Foto del vehículo — mismo patrón que la póliza, sin historial** (Clarifications, sesión
  2026-08-08): el administrador MUST poder adjuntar una foto opcional del vehículo (JPG o PNG,
  mismo límite de 10 MB), almacenada en el mismo bucket privado `documentos` con un nuevo valor
  `foto` en el enum `tipo_archivo` (ruta `documentos/foto/{empresa_id}/{vehiculo_id}/{archivo}`).
  A diferencia de la póliza, la foto NO MUST conservar historial de versiones: `vehiculos` MUST
  tener un puntero `foto_archivo_id` que se reemplaza al subir una nueva foto, y el objeto
  anterior en Storage (y su fila en `archivos`) MUST eliminarse en el mismo momento del
  reemplazo — no como parte de la eliminación del vehículo, sino en cada reemplazo individual.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrador da de alta un vehículo (Priority: P1)

Como administrador, quiero registrar un vehículo nuevo de mi flotilla con sus datos y, si ya la
tengo a la mano, su póliza de seguro, para empezar a llevar su control.

**Why this priority**: Sin esta historia no existe ningún vehículo que gestionar — es el punto de
entrada de todo lo demás en esta feature y en las que dependen de vehículos (Combustible,
Mantenimiento, Checklist).

**Independent Test**: Completar el formulario de alta con los datos obligatorios (sin adjuntar
póliza), guardar, y confirmar que el vehículo existe; repetir adjuntando una póliza y confirmar
que queda vinculada como vigente.

**Acceptance Scenarios**:

1. **Given** el administrador está en el formulario de alta, **When** completa marca, modelo,
   placa, tipo de vehículo y el resto de los campos obligatorios sin adjuntar póliza, **Then** el
   vehículo se crea exitosamente y aparece en el listado sin póliza adjunta.
2. **Given** el administrador está en el formulario de alta, **When** además adjunta un archivo
   PDF o imagen de la póliza dentro del límite de 10 MB, **Then** el vehículo se crea y el
   archivo queda vinculado como su póliza vigente.
3. **Given** ya existe un vehículo con una placa determinada en la empresa, **When** el
   administrador intenta crear otro con la misma placa, **Then** el formulario lo marca como
   duplicado antes de enviar.
4. **Given** el administrador intenta adjuntar un archivo que no es PDF/imagen o que excede 10
   MB, **When** intenta seleccionarlo o enviarlo, **Then** el sistema lo rechaza con un mensaje
   claro sin crear el vehículo con un archivo inválido.
5. **Given** el administrador completa el formulario con una póliza adjunta, **When** la subida
   del archivo falla por cualquier motivo después de haberse creado el vehículo, **Then** el
   vehículo queda creado sin póliza adjunta y el administrador puede agregarla después editando
   el registro — el alta no se pierde por el fallo de subida.
6. **Given** el administrador está en el formulario de alta, **When** además adjunta una foto
   (JPG o PNG, dentro del límite de 10 MB), **Then** el vehículo se crea con esa foto visible en
   su detalle (Clarifications, sesión 2026-08-08).
7. **Given** el administrador está en el formulario de alta, **When** además captura VIN,
   kilometraje actual, combustible y/o transmisión (todos opcionales), **Then** el vehículo se
   crea con esos datos visibles en su detalle (Clarifications, sesión 2026-08-08).

---

### User Story 2 - Administrador busca y consulta el listado de vehículos (Priority: P1)

Como administrador, quiero ver el listado de vehículos de mi empresa y buscar uno específico por
marca, modelo o placa, para ubicarlo rápido cuando lo necesito.

**Why this priority**: Sin poder ver y encontrar los vehículos dados de alta, el resto de las
historias (editar, dar de baja, asignar permisos) no tienen forma de usarse — es la contraparte
inseparable de US1 para que el alta tenga valor observable.

**Independent Test**: Con vehículos ya existentes en la base (dados de alta previamente o
sembrados directamente), abrir el listado, confirmar que aparecen, y usar el buscador para
encontrar uno específico por cada uno de los tres criterios (marca, modelo, placa).

**Acceptance Scenarios**:

1. **Given** la empresa tiene varios vehículos activos, **When** el administrador abre el
   listado, **Then** ve todos los vehículos activos (no dados de baja) con su estado de póliza
   indicado visualmente (vigente, por vencer, vencida).
2. **Given** el listado tiene vehículos con distintas marcas, modelos y placas, **When** el
   administrador busca por cualquiera de esos tres criterios, **Then** el listado se filtra a los
   vehículos que coinciden.
3. **Given** la empresa tiene vehículos dados de baja, **When** el administrador abre el listado
   sin activar el control de "Mostrar dados de baja", **Then** esos vehículos no aparecen.
4. **Given** el administrador activa el control "Mostrar dados de baja", **When** el listado se
   actualiza, **Then** los vehículos dados de baja aparecen, distinguibles visualmente de los
   activos.

---

### User Story 3 - Administrador edita un vehículo y gestiona el historial de su póliza (Priority: P2)

Como administrador, quiero corregir o actualizar los datos de un vehículo, incluyendo reemplazar
el archivo de su póliza cuando se renueva, sin perder acceso a las versiones anteriores.

**Why this priority**: Los datos de un vehículo (aseguradora, número de póliza, vigencia) cambian
con el tiempo; sin edición, un error de captura o una renovación obliga a dar de baja y crear un
vehículo nuevo, perdiendo su historial.

**Independent Test**: Editar un vehículo existente cambiando uno de sus campos y confirmar que se
guarda; reemplazar su archivo de póliza y confirmar que el anterior sigue disponible en el
historial de versiones, marcado como no vigente.

**Acceptance Scenarios**:

1. **Given** un vehículo existente, **When** el administrador edita cualquiera de sus campos
   (incluida la aseguradora o el número de póliza) y guarda, **Then** los cambios se reflejan sin
   afectar registros de otras entidades.
2. **Given** un vehículo con una póliza ya adjunta, **When** el administrador sube un nuevo
   archivo de póliza, **Then** el nuevo archivo queda como la póliza vigente y el anterior sigue
   existiendo, visible en el historial de versiones del vehículo.
3. **Given** un vehículo con más de una versión de póliza en su historial, **When** el
   administrador abre esa sección del detalle, **Then** ve cada versión con su fecha de subida,
   quién la subió, un enlace de descarga, y cuál de ellas es la vigente.

---

### User Story 4 - Administrador da de baja y reactiva un vehículo (Priority: P2)

Como administrador, quiero dar de baja un vehículo que ya no está en operación (sin eliminar su
historial), y poder reactivarlo si vuelve a circular.

**Why this priority**: Un vehículo puede dejar de operar temporal o permanentemente sin que deba
perderse su historial — es la alternativa a la eliminación física para el caso más común.

**Independent Test**: Dar de baja un vehículo capturando un motivo, confirmar que desaparece del
listado por defecto, y reactivarlo confirmando que vuelve a aparecer.

**Acceptance Scenarios**:

1. **Given** un vehículo activo, **When** el administrador usa la acción "Dar de baja" y captura
   un motivo (hasta 150 caracteres), **Then** el vehículo queda marcado como dado de baja y deja
   de aparecer en el listado por defecto.
2. **Given** el administrador intenta confirmar la baja sin capturar un motivo, **When** intenta
   enviar el formulario, **Then** el sistema lo bloquea exigiendo el motivo.
3. **Given** un vehículo dado de baja, **When** el administrador usa la acción "Reactivar",
   **Then** el vehículo vuelve a aparecer en el listado por defecto como activo.

---

### User Story 5 - Administrador elimina definitivamente un vehículo sin historial (Priority: P3)

Como administrador, quiero poder eliminar por completo un vehículo dado de alta por error o que
nunca tuvo operaciones registradas, para mantener el catálogo limpio.

**Why this priority**: Es un caso de uso real pero acotado (corregir errores de captura); la baja
ya cubre el escenario más común de "vehículo que deja de operar", por eso esta historia tiene
menor prioridad.

**Independent Test**: Intentar eliminar un vehículo con registros dependientes (bloqueado con
mensaje claro) y eliminar uno sin dependientes (procede sin error).

**Acceptance Scenarios**:

1. **Given** un vehículo con cargas de combustible, mantenimientos, checklists o servicios
   obligatorios registrados, **When** el administrador intenta eliminarlo definitivamente,
   **Then** el sistema rechaza la eliminación y muestra un mensaje claro (p. ej. "No se puede
   eliminar: tiene mantenimientos registrados").
2. **Given** un vehículo sin ningún registro dependiente, **When** el administrador lo elimina,
   **Then** el vehículo desaparece por completo sin error.
3. **Given** un vehículo sin registros dependientes pero con una o más versiones de póliza
   adjuntas en su historial, **When** el administrador lo elimina, **Then** el vehículo y todo su
   historial de archivos de póliza (registros y objetos en Storage) desaparecen juntos, sin dejar
   registros huérfanos.

---

### User Story 6 - Administrador asigna los permisos aplicables a un vehículo (Priority: P3)

Como administrador, quiero indicar qué permisos de circulación aplican a un vehículo específico y
su fecha de vencimiento, para llevar control de sus trámites vigentes.

**Why this priority**: Depende de que el catálogo de tipos de permiso (Feature 002) y el vehículo
ya existan; es un complemento del registro del vehículo, no un bloqueante para darlo de alta ni
para operarlo.

**Independent Test**: Desde el detalle de un vehículo, asignar un permiso del catálogo con una
fecha de vencimiento, confirmar que aparece en su lista de permisos asignados, editar esa fecha,
y luego quitar la asignación.

**Acceptance Scenarios**:

1. **Given** un vehículo sin permisos asignados, **When** el administrador abre la pestaña de
   permisos en su detalle y asigna uno del catálogo con una fecha de vencimiento, **Then** el
   permiso aparece en la lista de permisos aplicables del vehículo con esa fecha.
2. **Given** un vehículo con un permiso ya asignado, **When** el administrador intenta asignarle
   el mismo permiso de nuevo, **Then** el sistema lo rechaza como duplicado.
3. **Given** un vehículo con un permiso asignado, **When** el administrador edita su fecha de
   vencimiento, **Then** el cambio se refleja de inmediato.
4. **Given** un vehículo con un permiso asignado, **When** el administrador quita la asignación,
   **Then** el permiso deja de aparecer en la lista de permisos aplicables del vehículo (el
   catálogo de permisos en sí no se ve afectado).

---

### User Story 7 - Administrador consulta el detalle de un vehículo sin entrar a edición (Priority: P2)

Como administrador, quiero ver los datos de un vehículo en una vista de solo lectura al abrirlo
desde el listado, y entrar a editarlo solo cuando lo decido explícitamente, para no arriesgar un
cambio accidental al simplemente consultar su información.

**Why this priority**: Es la puerta de entrada al detalle que ya usan US-3.3 (edición e
historial de póliza), US-3.4 (baja/reactivación) y US-3.6 (permisos asignados) — sin esta
historia, esas tres dependen de abrir directo el formulario editable, lo que no coincide con el
patrón de UI ya establecido en el resto del sistema (p. ej. Configuración de la Empresa separa
lectura de edición).

**Independent Test**: Abrir un vehículo desde el listado y confirmar que se muestra en modo solo
lectura (sin campos editables); usar la acción "Editar" y confirmar que lleva al formulario ya
usado por US-3.3.

**Acceptance Scenarios**:

1. **Given** el administrador está en el listado de vehículos, **When** hace clic en un vehículo,
   **Then** se abre su detalle en modo solo lectura, con sus datos agrupados en tarjetas
   siguiendo la referencia de Stitch, con un ajuste sobre esa referencia (FR-026): "Identificación
   del Vehículo" (foto, marca, modelo, año, color, tipo, placa, VIN, número de serie, número de
   motor, kilometraje actual), "Seguro y Póliza" (aseguradora, número de póliza, vencimiento,
   estado de vigencia) y "Especificaciones Técnicas" (combustible, transmisión, número de ejes,
   capacidad de carga) — y ningún campo editable.
2. **Given** el administrador está viendo el detalle de un vehículo, **When** usa la acción
   "Editar", **Then** accede al formulario editable con los datos del vehículo precargados (mismo
   formulario de US-3.3).
3. **Given** el administrador terminó de editar y guardó los cambios, **When** el sistema
   confirma el guardado, **Then** regresa a la vista de detalle en modo solo lectura mostrando los
   datos actualizados, no se queda en el formulario.

---

### Edge Cases

- ¿Qué pasa si falla la subida del archivo de póliza durante el alta (paso 2)? El vehículo ya
  creado en el paso 1 permanece; el administrador puede intentar adjuntar la póliza después desde
  edición (decisión confirmada arriba).
- ¿Qué pasa si el administrador intenta editar la placa de un vehículo a un valor que ya usa otro
  vehículo de la misma empresa? Se rechaza igual que en el alta — duplicado marcado antes de
  enviar, con el `UNIQUE(empresa_id, placa)` de respaldo en base de datos.
- ¿Qué pasa si dos administradores suben una nueva versión de póliza casi al mismo tiempo? Ambos
  archivos quedan guardados en el historial; el vehículo termina apuntando a lo que haya sido la
  última actualización exitosa — no hay pérdida de datos, solo se define cuál queda marcada como
  vigente.
- ¿Qué pasa si se intenta eliminar un vehículo justo cuando otro proceso le acaba de registrar un
  mantenimiento? El `DELETE` es rechazado por la base de datos en ese mismo momento (la
  restricción de integridad referencial se evalúa al ejecutar la operación, no antes) — el
  mensaje de error se muestra igual, sin condición de carrera real.
- ¿Qué pasa si el administrador intenta reactivar un vehículo que nunca fue dado de baja? La
  acción "Reactivar" no está disponible para vehículos ya activos — solo aparece para los dados
  de baja.
- ¿Qué pasa si el archivo seleccionado tiene una extensión válida pero contenido corrupto o de
  otro tipo real? Fuera de alcance de esta feature validar el contenido más allá del tipo MIME y
  la extensión declarados — mismo nivel de validación que el resto del sistema.
- ¿Qué pasa si falla la subida de una foto nueva durante un reemplazo? La foto anterior MUST
  seguir siendo la vigente hasta que la nueva termine de subirse y vincularse exitosamente — el
  reemplazo no MUST borrar la foto anterior antes de confirmar que la nueva quedó lista (mismo
  criterio de "no perder lo que ya existía" que FR-005 aplica al alta).
- ¿Qué pasa si el administrador nunca adjunta una foto? El vehículo funciona con normalidad; el
  detalle MUST mostrar un estado vacío (p. ej. un ícono genérico) en vez de exigir una foto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El administrador MUST poder dar de alta un vehículo capturando marca, modelo, placa
  (obligatoria), color, número de serie, número de motor, capacidad de carga, año, número de
  ejes, VIN, kilometraje actual, combustible, transmisión (los últimos cuatro opcionales,
  Clarifications sesión 2026-08-08), tipo de vehículo (obligatorio, del catálogo de Catálogos
  Base), aseguradora (del catálogo de Catálogos Base), número de póliza y fecha de vencimiento de
  póliza.
- **FR-002**: El sistema MUST validar que la placa capturada no esté ya en uso por otro vehículo
  de la misma empresa, marcándolo en el formulario antes de enviar, además del `UNIQUE(empresa_id,
  placa)` de respaldo en base de datos.
- **FR-003**: El administrador MUST poder adjuntar un archivo de póliza (PDF o imagen) durante el
  alta, de forma opcional; si no lo adjunta en ese momento, MUST poder hacerlo después editando
  el vehículo.
- **FR-004**: El sistema MUST rechazar archivos que no sean PDF, JPG o PNG, o que excedan 10 MB,
  antes de intentar subirlos.
- **FR-005**: Si la subida del archivo de póliza falla durante el alta, el sistema MUST conservar
  el vehículo ya creado sin bloquear ni revertir el alta completa.
- **FR-006**: El sistema MUST proveer un listado de los vehículos de la empresa del usuario, con
  buscador por marca, modelo o placa.
- **FR-007**: El listado de vehículos MUST ocultar por defecto los vehículos dados de baja, y
  MUST ofrecer un control explícito para incluirlos.
- **FR-008**: Cada vehículo en el listado MUST mostrar un indicador visual del estado de su
  póliza: "vencida" si la fecha de vencimiento ya pasó, "por vencer" si faltan 60 días o menos
  para esa fecha, o "vigente" en cualquier otro caso (Clarifications, sesión 2026-08-08).
- **FR-009**: El administrador MUST poder editar cualquier dato de un vehículo existente,
  incluyendo los mismos campos capturados en el alta.
- **FR-010**: El administrador MUST poder reemplazar el archivo de póliza de un vehículo; el
  archivo anterior NO MUST eliminarse — MUST permanecer disponible en el historial de versiones,
  y el vehículo MUST quedar apuntando al nuevo archivo como su póliza vigente.
- **FR-011**: El detalle de un vehículo MUST mostrar el historial completo de versiones de su
  póliza (fecha de subida, quién la subió, enlace de descarga), indicando cuál es la vigente.
- **FR-012**: El administrador MUST poder dar de baja un vehículo mediante una acción dedicada que
  exige capturar un motivo de hasta 150 caracteres antes de confirmar; el sistema MUST impedir
  confirmar la baja sin ese motivo.
- **FR-013**: Un vehículo dado de baja MUST dejar de aparecer en el listado por defecto (FR-007),
  sin perder ninguno de sus datos ni su historial.
- **FR-014**: El administrador MUST poder reactivar un vehículo dado de baja, y esa acción MUST
  estar disponible solo para vehículos que estén dados de baja.
- **FR-015**: El administrador MUST poder eliminar definitivamente un vehículo que no tenga
  registros dependientes (cargas de combustible, mantenimientos, checklists o servicios
  obligatorios).
- **FR-016**: Al intentar eliminar un vehículo con registros dependientes, el sistema MUST
  capturar el error de integridad referencial de la base de datos y mostrar un mensaje explícito
  indicando por qué no se puede eliminar, sin exponer detalles técnicos del error.
- **FR-016a**: Al eliminar definitivamente un vehículo, el sistema MUST eliminar también todos los
  registros de `archivos` asociados a él (todo su historial de versiones de póliza) y los
  objetos correspondientes en Storage, como parte de la misma operación — no deben quedar
  registros ni archivos huérfanos (Clarifications, sesión 2026-08-08).
- **FR-017**: El detalle de un vehículo MUST incluir una sección separada para asignarle permisos
  del catálogo de Catálogos Base, cada asignación con su propia fecha de vencimiento.
- **FR-018**: El sistema MUST impedir asignar el mismo permiso dos veces al mismo vehículo.
- **FR-019**: El administrador MUST poder editar la fecha de vencimiento de un permiso ya asignado
  a un vehículo, y MUST poder quitar la asignación sin afectar el catálogo de permisos en sí.
- **FR-020**: Los archivos de póliza MUST almacenarse aislados por empresa: ningún usuario MUST
  poder acceder, listar ni descargar archivos pertenecientes a otra empresa.
- **FR-021**: Un operario sin permisos de escritura otorgados explícitamente en el módulo
  `vehiculos` MUST poder ver el listado, el detalle y el historial de póliza de los vehículos de
  su empresa, pero NO MUST poder crear, editar, dar de baja, reactivar, eliminar vehículos ni
  gestionar sus permisos asignados.
- **FR-022**: El detalle de un vehículo MUST mostrarse por defecto en modo de solo lectura, sin
  campos editables; el sistema MUST proveer una acción explícita ("Editar") que lleva al
  formulario editable — el listado NO MUST llevar directo al formulario (Clarifications, sesión
  2026-08-08).
- **FR-023**: El administrador MUST poder adjuntar una foto del vehículo (JPG o PNG, máximo 10
  MB) de forma opcional, durante el alta o después editando el registro (Clarifications, sesión
  2026-08-08).
- **FR-024**: El administrador MUST poder reemplazar la foto de un vehículo; a diferencia del
  archivo de póliza (FR-010), la foto anterior MUST eliminarse (registro en `archivos` y objeto
  en Storage) en el mismo momento del reemplazo — no se conserva historial de versiones de foto
  (Clarifications, sesión 2026-08-08).
- **FR-025**: El sistema MUST rechazar archivos de foto que no sean JPG o PNG, o que excedan 10
  MB, antes de intentar subirlos (mismo criterio que FR-004 para la póliza).
- **FR-026**: El detalle de solo lectura de un vehículo (US-3.7) MUST agrupar sus datos en
  tarjetas siguiendo la referencia de Stitch (`detalle-vehiculo-datos-generales.png`), no una
  sola tarjeta con todos los campos en una cuadrícula uniforme. Con un ajuste sobre esa
  referencia, hecho tras revisar el resultado en pantalla (feedback directo, no otra ronda de
  `/speckit-clarify`): "Registro y Seguimiento" MUST fusionarse dentro de "Identificación del
  Vehículo" en vez de ser su propia tarjeta (menos separación entre datos del mismo vehículo, 3
  tarjetas en vez de 4) — "Identificación del Vehículo" (foto, marca, modelo, año, color, tipo de
  vehículo, placa, VIN, número de serie, número de motor, kilometraje actual), "Seguro y Póliza"
  (aseguradora, número de póliza, fecha de vencimiento, estado de vigencia — en vez de "Estado
  Operativo" del mockup, que no aplica) y "Especificaciones Técnicas" (combustible, transmisión,
  número de ejes, capacidad de carga).

### Key Entities

- **Vehículo**: entidad central de esta feature. Atributos: marca, modelo, placa (única por
  empresa), color, número de serie, número de motor, capacidad de carga, año, número de ejes,
  VIN, kilometraje actual, combustible, transmisión (los últimos cuatro opcionales, Clarifications
  sesión 2026-08-08), tipo de vehículo (referencia a Catálogos Base), aseguradora (referencia a
  Catálogos Base), número de póliza, fecha de vencimiento de póliza, referencia a su archivo de
  póliza vigente, referencia a su foto vigente (opcional, sin historial — a diferencia de la
  póliza), estado de baja y motivo. Referenciado por Combustible, Mantenimiento, Checklist y
  Servicios Obligatorios (features futuras).
- **Archivo de póliza**: cada versión de póliza subida para un vehículo. Atributos: tipo de
  documento, ruta de almacenamiento, a qué vehículo pertenece, quién lo subió, cuándo. Un
  vehículo conserva todas sus versiones históricas; solo una a la vez es la vigente. Su ciclo de
  vida está ligado al del vehículo: se elimina junto con él (FR-016a), no de forma independiente.
- **Foto del vehículo**: mismo tipo de registro que el archivo de póliza (misma tabla `archivos`,
  nuevo valor `foto` del enum de tipo), pero sin historial: cada reemplazo elimina la versión
  anterior en el mismo momento (FR-024), no solo al eliminar el vehículo.
- **Asignación de permiso a vehículo**: relación entre un vehículo y un tipo de permiso del
  catálogo de Catálogos Base, con su propia fecha de vencimiento. Un vehículo puede tener varias
  asignaciones; cada combinación vehículo-permiso es única.

## Fuera de Alcance

- **Línea de tiempo/historial completo del vehículo** (combustible, mantenimientos, checklists en
  un solo lugar): no tiene sentido construirla todavía porque esas features (fuentes de ese
  historial) no existen aún. Se construye cuando ya generen datos.
- **Alertas automáticas de vencimiento de póliza**: pertenecen a una feature de Alertas/Dashboard
  posterior que necesita varias features con fechas de vencimiento ya existiendo para tener
  sentido. Esta feature solo muestra el estado de vencimiento visualmente en el listado (FR-008);
  no envía notificaciones.
- **Ocultar vehículos dados de baja como opción en formularios de Combustible, Mantenimiento o
  Checklist**: esas features no existen todavía; la regla queda anotada para cuando se
  construyan, no se implementa aquí.
- **"Conductor Asignado" y "Último Mantenimiento" del mockup de detalle** (Clarifications, sesión
  2026-08-08): a diferencia de VIN/kilometraje/combustible/transmisión (datos intrínsecos del
  vehículo, sí agregados — FR-001, FR-026), estos dos son relaciones hacia entidades de
  Conductores y Mantenimiento que no existen todavía; se agregan a la vista de detalle cuando esas
  features se construyan.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede dar de alta un vehículo completo (con póliza adjunta) en
  menos de 3 minutos.
- **SC-002**: El 100% de los intentos de crear o editar un vehículo con una placa duplicada dentro
  de la misma empresa son detectados por el formulario antes de enviarse.
- **SC-003**: El 100% de los intentos de eliminar un vehículo con registros dependientes son
  rechazados con un mensaje claro y comprensible, sin que el usuario vea un error técnico crudo.
- **SC-004**: Un fallo en la subida del archivo de póliza durante el alta nunca provoca la pérdida
  del vehículo ya capturado — 100% de esos casos dejan el vehículo creado sin póliza, no un alta
  fallida por completo.
- **SC-005**: Un administrador puede localizar un vehículo específico dentro de un listado de
  hasta 100 vehículos usando el buscador en menos de 10 segundos.
- **SC-006**: El 100% de las versiones anteriores de una póliza reemplazada siguen siendo
  accesibles desde el historial del vehículo después del reemplazo.
- **SC-007**: Cero accesos exitosos de un usuario de una empresa a los archivos de póliza de otra
  empresa.

## Assumptions

- El umbral de "por vencer" (FR-008, 60 días) no requiere configuración por empresa en esta
  feature — es un valor fijo para todas.
- La descarga de un archivo de póliza desde el historial de versiones se resuelve mediante un
  enlace de acceso temporal (no una URL pública permanente), consistente con que el bucket de
  documentos es privado — el usuario no necesita saber esto, solo que el enlace funciona mientras
  tiene sesión activa y permiso de ver ese vehículo.
- El sistema no valida el contenido real de un archivo adjunto más allá de su tipo MIME y
  extensión declarados (mismo nivel de validación ya usado en el resto del sistema para
  adjuntos).
- Al igual que en Catálogos Base, cada uno de los campos de este catálogo (búsqueda, tipos de
  permiso aplicables) sigue el mismo patrón de aislamiento por empresa y de permisos granulares
  por módulo (`vehiculos`) ya establecido en el resto del sistema.
- La asignación de permisos a un vehículo (US-3.6) no dispara ninguna alerta ni notificación
  automática de vencimiento en esta feature — eso pertenece a una feature de Alertas posterior,
  según ya se aclaró en "Fuera de alcance".
