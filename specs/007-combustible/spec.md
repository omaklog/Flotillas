# Feature Specification: Combustible

**Feature Branch**: `007-combustible`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Feature 007 — Combustible: registro de cargas de combustible por
vehículo, inmutable una vez capturado (solo cancelable, con motivo), con validación de odómetro
creciente y adjunto de factura."

## Resumen

Permite capturar el registro de cada carga de combustible de un vehículo de la flotilla: fecha,
odómetro, producto, cantidad, costo y factura opcional. Una vez capturado, el registro es
**inmutable** — los datos operativos/financieros nunca se editan; la única acción posterior
permitida es cancelarlo (con motivo obligatorio), de forma permanente y sin reactivación. El
odómetro capturado se valida contra la última carga activa de ese mismo vehículo para evitar
retrocesos accidentales.

## Actores

- **Administrador**: acceso completo — captura, consulta y cancela cargas de combustible de su
  propia empresa (el rol `admin` siempre tiene todos los permisos de este módulo).
- **Operario**: tiene permiso `crear` en el módulo `combustible` otorgado por defecto (junto con
  `ver`) — puede capturar y consultar cargas sin configuración adicional. Cancelar requiere el
  permiso `cancelar`, que un administrador debe otorgar explícitamente; no se concede por
  defecto.

## Clarifications

### Session 2026-08-10

- Q: La factura de una carga se puede reemplazar mientras el registro siga activo — ¿sigue el
  patrón "con historial" (póliza, licencia) o "sin historial" (foto)? → A: Con historial, mismo
  patrón que póliza/licencia — se conservan todas las versiones subidas.
- Q: Si un vehículo se da de baja después de tener cargas capturadas, ¿el filtro de vehículo del
  listado (US-7.2) sigue permitiendo filtrar por él, o también lo excluye como el selector de
  captura? → A: También lo excluye — un vehículo dado de baja deja de ser filtrable por el
  selector de vehículo; su historial sigue visible en el listado general (sin filtrar por
  vehículo, p. ej. filtrando por fecha o proveedor), solo no aparece como opción del filtro.
- Q: Tras sobreescribir manualmente el costo total, si el usuario vuelve a cambiar cantidad o
  costo unitario, ¿el sistema recalcula el costo total de nuevo o mantiene el valor manual
  congelado? → A: Recalcula de nuevo en cada cambio de cantidad/costo unitario — el override
  manual solo "pega" hasta el siguiente cambio de esos dos campos; si el usuario vuelve a editar
  el costo total después, ese nuevo valor manual vuelve a "pegar" de la misma forma.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Inmutabilidad, con cancelación como única salida**: una vez guardada, una carga no se edita
  jamás — ni sus datos operativos/financieros ni, tras cancelarla, su propio motivo de
  cancelación. La única transición de estado permitida es `activo` → `cancelado`, y es
  irreversible (a diferencia de dar de baja un vehículo/conductor/proveedor, que sí se puede
  reactivar). Cancelar exige un motivo obligatorio (máximo 150 caracteres), igual que dar de
  baja.
- **Costo total autocalculado pero editable, recalcula hasta la siguiente edición manual**: al
  capturar, el sistema propone `cantidad × costo_unitario` como costo total, pero el campo admite
  edición manual antes de guardar (p. ej. para reflejar un descuento). Ese valor manual solo
  "pega" hasta que el usuario vuelva a cambiar cantidad o costo unitario — en ese momento el
  sistema vuelve a autocalcular, descartando el override anterior (Clarifications, sesión
  2026-08-10). El valor que se guarda es el que esté en el campo al momento de enviar el
  formulario, sea autocalculado o manual.
- **Odómetro creciente contra la última carga activa**: el odómetro capturado debe ser mayor o
  igual al de la última carga **activa** (no canceladas) de ese mismo vehículo; si es menor, se
  rechaza con un mensaje claro antes de guardar. Un vehículo sin cargas activas previas acepta
  cualquier odómetro. La validación existe en dos capas: la UI la aplica antes de enviar, y la
  base de datos la vuelve a aplicar como respaldo (no se puede saltar enviando datos directo a la
  API).
- **Factura reemplazable mientras el registro siga activo, con historial**: igual que la póliza
  de Vehículos o la licencia de Conductores, el adjunto de factura de una carga se puede
  reemplazar después de capturado — pero solo mientras el registro siga `activo` — y **conserva
  todas las versiones anteriores** (Clarifications, sesión 2026-08-10): la inmutabilidad de esta
  feature protege los datos operativos/financieros (fecha, odómetro, cantidad, costos), no el
  historial de archivos, que además refuerza el espíritu de auditoría de la feature. Una vez
  cancelado el registro, el archivo (y su historial) también queda congelado como el resto.
- **Selectores excluyen registros inactivos**: el selector de vehículo excluye los dados de baja
  (mismo criterio que Asignación Conductor-Vehículo, Feature 005); el selector de proveedor
  excluye los inactivos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capturar una carga de combustible (Priority: P1)

Como administrador u operario con permiso `crear` en combustible, quiero registrar cada carga de
combustible de un vehículo con sus datos y, opcionalmente, su factura, para llevar un historial
confiable de consumo y gasto por vehículo.

**Why this priority**: Es el núcleo de la feature — sin captura no hay datos que consultar,
filtrar ni eventualmente reportar.

**Independent Test**: Capturar una carga completa (con y sin factura) para un vehículo activo y
confirmar que queda guardada, visible, y con los datos correctos; intentar capturar con un
odómetro menor al de la última carga activa del mismo vehículo y confirmar que se rechaza antes
de guardar.

**Acceptance Scenarios**:

1. **Given** el formulario de captura, **When** el usuario selecciona un vehículo activo, un
   proveedor activo, un producto de tipo combustible, indica fecha (hoy o anterior), odómetro
   (mayor o igual al de la última carga activa de ese vehículo), cantidad y costo unitario, y
   guarda, **Then** la carga se crea como `activo` con el costo total autocalculado
   (`cantidad × costo_unitario`).
2. **Given** el formulario de captura con el costo total ya autocalculado, **When** el usuario lo
   sobreescribe manualmente antes de guardar, **Then** se guarda el valor manual, no el
   autocalculado; **but When** el usuario cambia cantidad o costo unitario después de esa
   sobreescritura, **Then** el costo total vuelve a autocalcularse, descartando el valor manual
   anterior.
3. **Given** el formulario de captura, **When** el usuario adjunta una factura (PDF o imagen)
   junto con el resto de los datos y guarda, **Then** la carga se crea con esa factura asociada.
4. **Given** el formulario de captura, **When** el usuario indica un odómetro menor al de la
   última carga **activa** de ese mismo vehículo, **Then** el sistema lo rechaza con un mensaje
   claro antes de intentar guardar.
5. **Given** un vehículo sin ninguna carga activa previa, **When** el usuario captura su primera
   carga con cualquier valor de odómetro, **Then** se acepta sin comparación (no hay carga previa
   contra la cual validar).
6. **Given** el selector de vehículo o de proveedor, **When** se despliega, **Then** no incluye
   vehículos dados de baja ni proveedores inactivos.
7. **Given** una empresa sin ningún producto configurado con tipo combustible, **When** el
   usuario abre el formulario de captura, **Then** el sistema muestra un mensaje claro dirigiendo
   a crear uno primero, en vez de un selector vacío sin explicación.

---

### User Story 2 - Listado y búsqueda de cargas de combustible (Priority: P1)

Como administrador u operario con permiso `ver` en combustible, quiero consultar y filtrar el
historial de cargas capturadas, para revisar el consumo y gasto de la flotilla.

**Why this priority**: Sin un listado consultable, la captura de la User Story 1 no genera valor
utilizable — es la otra mitad indispensable del mismo flujo básico.

**Independent Test**: Con varias cargas ya capturadas (activas y canceladas, de distintos
vehículos, proveedores y fechas), aplicar cada filtro por separado y confirmar que el listado
muestra exactamente los registros esperados.

**Acceptance Scenarios**:

1. **Given** el listado de cargas de combustible, **When** se filtra por vehículo, por rango de
   fechas, por proveedor o por estado, **Then** se muestran únicamente las cargas que cumplen ese
   filtro.
2. **Given** el listado, **When** se muestra una fila, **Then** incluye vehículo, fecha,
   cantidad, costo total y estado.
3. **Given** una carga cancelada, **When** aparece en el listado, **Then** se muestra igual que
   las activas (no se oculta), con una marca visual que la distingue claramente como cancelada.
4. **Given** un vehículo dado de baja que tiene cargas ya capturadas, **When** se despliega el
   filtro de vehículo del listado, **Then** ese vehículo no aparece como opción — pero sus cargas
   siguen visibles en el listado general sin ese filtro aplicado.

---

### User Story 3 - Cancelar una carga de combustible (Priority: P2)

Como administrador u operario con permiso `cancelar` en combustible, quiero cancelar una carga
capturada por error o que ya no es válida, dejando constancia del motivo, para corregir el
historial sin borrar evidencia de lo ocurrido.

**Why this priority**: Es un flujo de corrección secundario — necesario, pero la feature ya
entrega valor completo (capturar y consultar) sin él.

**Independent Test**: Cancelar una carga activa con un motivo válido y confirmar que queda
`cancelado`, sin botón de reactivar y sin poder editar ningún campo (incluido el propio motivo)
después; confirmar que un usuario sin el permiso `cancelar` no ve la acción disponible.

**Acceptance Scenarios**:

1. **Given** una carga activa, **When** un usuario con permiso `cancelar` la cancela capturando
   un motivo (hasta 150 caracteres), **Then** la carga queda `cancelado` de forma permanente.
2. **Given** una carga activa, **When** un usuario con permiso `cancelar` intenta confirmar la
   cancelación sin capturar un motivo, **Then** el sistema lo bloquea y no cancela nada.
3. **Given** una carga ya cancelada, **When** se consulta su detalle, **Then** no existe ninguna
   acción para reactivarla ni para editar su motivo de cancelación.
4. **Given** un usuario sin el permiso `cancelar` en el módulo combustible (incluido un operario
   con solo `ver`/`crear`, los permisos por defecto), **When** consulta una carga activa,
   **Then** no ve disponible la acción de cancelar.

---

### Edge Cases

- ¿Qué pasa si el odómetro capturado es exactamente igual al de la última carga activa del mismo
  vehículo? Se acepta — la validación rechaza solo valores **menores**, no iguales.
- ¿Qué pasa si falla la subida de la factura durante la captura? La carga ya creada MUST
  conservarse sin factura — mismo criterio que la foto del vehículo/conductor y la licencia: el
  archivo es un adjunto opcional, su fallo no revierte el registro principal.
- ¿Qué pasa si se intenta reemplazar la factura de una carga ya cancelada? Se rechaza — tras
  cancelar, el registro (incluido su archivo adjunto) queda completamente congelado, sin
  excepción para la factura.
- ¿Qué pasa si se elimina definitivamente el vehículo o el proveedor de una carga ya capturada?
  Fuera de alcance de esta feature: la eliminación de vehículos/proveedores con registros
  dependientes ya está bloqueada por la regla de integridad referencial general de esas
  features — una carga de combustible cuenta como dependiente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir capturar una carga de combustible con vehículo, proveedor,
  producto, fecha, odómetro, cantidad y costo unitario.
- **FR-002**: El sistema MUST calcular el costo total como `cantidad × costo_unitario` al
  momento de capturar, dejando el campo editable; si el usuario lo modifica manualmente antes de
  guardar, MUST respetar ese valor en vez del autocalculado — pero si el usuario vuelve a cambiar
  cantidad o costo unitario después, MUST volver a autocalcular el costo total, descartando el
  valor manual anterior (Clarifications, sesión 2026-08-10).
- **FR-003**: El sistema MUST rechazar, antes de guardar, cualquier captura cuyo odómetro sea
  menor al de la última carga **activa** del mismo vehículo; un vehículo sin cargas activas
  previas MUST aceptar cualquier valor.
- **FR-004**: El selector de vehículo (tanto en el formulario de captura como en el filtro del
  listado) MUST excluir los vehículos dados de baja; el selector de proveedor MUST excluir los
  proveedores inactivos. Un vehículo dado de baja después de tener cargas capturadas deja de ser
  filtrable por vehículo, pero su historial sigue visible en el listado general sin ese filtro
  (Clarifications, sesión 2026-08-10).
- **FR-005**: El selector de producto MUST mostrar únicamente productos de tipo combustible; si
  la empresa no tiene ninguno configurado, el sistema MUST mostrar un mensaje claro que dirija a
  crear uno antes de continuar.
- **FR-006**: La fecha de una carga MUST ser hoy o anterior; nunca una fecha futura.
- **FR-007**: El sistema MUST permitir adjuntar una factura (PDF o imagen) de forma opcional al
  momento de capturar.
- **FR-008**: Una vez guardada, una carga MUST ser inmutable en todos sus datos operativos y
  financieros (vehículo, proveedor, producto, fecha, odómetro, cantidad, costo unitario, costo
  total) — la única modificación posterior permitida es la transición de `estado` a `cancelado` y
  su `motivo_cancelacion` en el momento de cancelar.
- **FR-009**: El sistema MUST permitir reemplazar el archivo de factura de una carga mientras
  siga `activo`, conservando todas las versiones anteriores (con historial, mismo patrón que
  póliza/licencia — Clarifications, sesión 2026-08-10), sin que eso cuente como violación de la
  inmutabilidad de FR-008.
- **FR-010**: El sistema MUST permitir listar y filtrar cargas de combustible por vehículo, rango
  de fechas, proveedor y estado.
- **FR-011**: El listado MUST mostrar, por cada carga, vehículo, fecha, cantidad, costo total y
  estado; las cargas canceladas MUST mostrarse junto con las activas, distinguidas visualmente.
- **FR-012**: El sistema MUST permitir cancelar una carga `activa` únicamente a usuarios con el
  permiso `cancelar` del módulo `combustible` (administrador siempre; operario solo si se le
  otorgó explícitamente — no viene por defecto).
- **FR-013**: Cancelar una carga MUST exigir un motivo obligatorio (máximo 150 caracteres); el
  sistema MUST bloquear la confirmación si el motivo está vacío.
- **FR-014**: Una vez cancelada, una carga MUST quedar en ese estado de forma permanente — el
  sistema MUST NOT ofrecer ninguna acción para reactivarla ni para editar su motivo de
  cancelación después de confirmada.
- **FR-015**: Si la subida de la factura falla durante la captura, el sistema MUST conservar la
  carga ya creada sin bloquear ni revertir el registro completo.

### Key Entities

- **Carga de combustible**: registro de una recarga de combustible de un vehículo — vehículo,
  proveedor, producto (tipo combustible), fecha, odómetro, cantidad, costo unitario, costo total,
  factura adjunta (opcional, con historial de versiones), estado (`activo`/`cancelado`) y motivo
  de cancelación (solo si `cancelado`). Inmutable salvo por la transición de estado y el
  reemplazo de la factura (agregando una nueva versión) mientras esté activo.

## Fuera de Alcance

- Reportes de consumo o rendimiento por vehículo — pertenecen a una feature de Reportes futura,
  que necesita Combustible (y Mantenimiento) ya existiendo para tener datos que mostrar.
- Alertas por anomalías de consumo (picos, patrones inusuales) — no se pidió; sería parte de una
  eventual feature de Reportes Inteligentes, fuera del MVP.
- Edición de cualquier dato operativo/financiero tras la captura — por diseño, la única
  corrección posible es cancelar y capturar un registro nuevo.
- Integrar la validación de odómetro creciente con otras fuentes de kilometraje (por ejemplo, un
  checklist de seguridad) — no existe ninguna otra feature que registre kilometraje hoy; ver
  Assumptions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las cargas capturadas con datos válidos quedan visibles de inmediato en
  el listado, con el costo total correcto (autocalculado o manual, según lo que el usuario haya
  dejado).
- **SC-002**: El 100% de los intentos de captura con un odómetro menor al de la última carga
  activa del mismo vehículo se rechazan antes de guardarse — ningún registro con retroceso de
  odómetro queda persistido.
- **SC-003**: El 100% de las cancelaciones exigen un motivo capturado y son irreversibles — cero
  cargas canceladas regresan a `activo` o cambian su motivo después de confirmadas.
- **SC-004**: El 100% de los intentos de cancelar por parte de un usuario sin el permiso
  `cancelar` son bloqueados.

## Assumptions

- **Depende de `proveedores.activo`, aún sin migrar**: el selector de proveedor (FR-004) asume
  que existe una columna `activo` en `proveedores` para excluir inactivos —
  `docs/schema-reference/schema_08_proveedores_activo.sql` la agrega, pero esa migración todavía
  no se ha aplicado a la fecha de este spec. Esta feature MUST tratar esa migración como
  prerrequisito de Foundational (junto con `schema_09_combustible_ajustes.sql`), no asumir que ya
  existe.
- **Esquema base ya existente, sin cambios de alcance**: la tabla `cargas_combustible`, el
  bucket `documentos`, el módulo de permisos `combustible` (`ver`/`crear`/`cancelar`, con `ver` y
  `crear` otorgados por defecto a todo operario nuevo) y el enum `tipo_producto` (ya incluye
  `'combustible'`) existen desde la migración inicial del proyecto — esta feature no los crea,
  solo construye la UI y la lógica de negocio sobre ellos. Los ajustes pendientes específicos de
  esta feature (`motivo_cancelacion`, la validación de odómetro a nivel de trigger, y la
  separación del trigger de inmutabilidad de `mantenimientos`) están descritos en
  `docs/schema-reference/schema_09_combustible_ajustes.sql`, tampoco aplicado todavía.
- **Validación de odómetro, alcance actual**: la pregunta de si la validación de odómetro
  creciente debería considerar también el kilometraje que un futuro checklist de seguridad
  pudiera registrar no tiene una respuesta útil hoy — esa feature no existe, no genera ningún
  dato de kilometraje que comparar. Esta feature MUST validar únicamente contra el propio
  historial de `cargas_combustible` del vehículo, tal como ya lo implementa el trigger de
  `schema_09`. Si en el futuro se construye un checklist de seguridad con su propio registro de
  kilometraje, esa feature (no esta) MUST decidir explícitamente si integra o no esa validación
  cruzada — no se deja como deuda implícita de Combustible.
- **Unidades de medida**: cantidad y odómetro se muestran con la unidad ya configurada por la
  empresa (`unidad_combustible`, `unidad_distancia` — Feature 001), sin conversión: el sistema no
  valida ni convierte entre litros/galones o km/millas, solo etiqueta el campo con la unidad
  configurada.
