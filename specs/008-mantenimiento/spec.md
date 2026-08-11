# Feature Specification: Mantenimiento (Correctivo y Preventivo)

**Feature Branch**: `008-mantenimiento`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Feature 008 — Mantenimiento (Correctivo y Preventivo): registro de
mantenimientos correctivos y preventivos por vehículo, con múltiples líneas por orden
(refacciones, llantas, servicios, productos), costo total a nivel de orden (sin desglose de
impuestos), inmutable una vez capturado salvo cancelación con motivo. Mismo patrón de
inmutabilidad que Combustible (007), pero con múltiples líneas por orden."

## Resumen

Administración de órdenes de mantenimiento (correctivo o preventivo) por vehículo, cada una
compuesta por una o más líneas de trabajo (refacción, llanta, servicio o producto). El costo se
captura a nivel de orden completa, no por línea. Una vez guardada, la orden y todas sus líneas son
**inmutables** — la única acción posterior permitida es cancelarla (con motivo obligatorio), de
forma permanente y sin reactivación, igual que Combustible (007).

## Actores

- **Administrador**: acceso completo — captura, consulta y cancela órdenes de mantenimiento de su
  propia empresa (el rol `admin` siempre tiene todos los permisos de este módulo).
- **Operario**: tiene permiso `crear` en el módulo `mantenimiento` otorgado por defecto (junto con
  `ver`) — puede capturar y consultar órdenes sin configuración adicional. Cancelar requiere el
  permiso `cancelar`, que un administrador debe otorgar explícitamente; no se concede por
  defecto.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Una orden admite varias líneas** (como una orden de servicio): se pueden agregar múltiples
  productos/refacciones/llantas/servicios dentro de la misma captura, cada una como una fila en
  `mantenimiento_detalles`.
- **Cantidad solo aplica a líneas tipo Producto/Refacción** (ej. "3 pastillas de freno") — las
  líneas de tipo Llanta o Servicio no la usan, tienen sus propios campos específicos.
- **Costo total a nivel de orden, no por línea**: un solo campo capturado directamente por el
  usuario, sin autocálculo desde las líneas ni desglose de impuestos por producto — a diferencia
  de Combustible, aquí no hay costo unitario por línea que sumar.
- **Inmutabilidad, con cancelación como única salida**: mismo patrón que Combustible (007) — una
  vez guardada, una orden (y todas sus líneas) no se edita jamás, salvo la transición
  `activo` → `cancelado` (irreversible) y el reemplazo del archivo de factura mientras siga
  activa. Cancelar exige un motivo obligatorio (máximo 150 caracteres); sin botón de "reactivar",
  a diferencia de dar de baja un vehículo/conductor/proveedor.
- **Selector de vehículo excluye vehículos dados de baja**; el selector de proveedor excluye los
  inactivos — mismo criterio que Combustible.
- **Factura reemplazable mientras la orden siga activa, con historial**: mismo patrón que la
  factura de Combustible (y la póliza de Vehículos/licencia de Conductores) — se conservan todas
  las versiones subidas.
- **El selector de producto de cada línea nunca ofrece productos de tipo Combustible** — ya
  filtrado por `productos.tipo`; solo aplican Refacción, Llanta, Servicio y Consumible/Producto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capturar una orden de mantenimiento (Priority: P1)

Como administrador u operario con permiso `crear` en mantenimiento, quiero registrar una orden de
mantenimiento con una o más líneas de trabajo y, opcionalmente, su factura, para llevar un
historial confiable del mantenimiento correctivo y preventivo de la flotilla.

**Why this priority**: Es el núcleo de la feature — sin captura no hay datos que consultar,
filtrar ni eventualmente reportar.

**Independent Test**: Capturar una orden completa con al menos 2 líneas de tipos distintos (por
ejemplo, una Refacción y un Servicio), con y sin factura, para un vehículo activo, y confirmar
que queda guardada, visible en su detalle con todas sus líneas correctas, y con el costo total
capturado.

**Acceptance Scenarios**:

1. **Given** el formulario de captura, **When** el usuario selecciona tipo (correctivo o
   preventivo), un vehículo activo, un proveedor activo, indica fecha (hoy o anterior), agrega al
   menos una línea con su producto correspondiente, captura el costo total y notas, y guarda,
   **Then** la orden se crea como `activo` con todas sus líneas asociadas.
2. **Given** una línea cuyo producto es de tipo Llanta, **When** el usuario la agrega, **Then** el
   formulario captura marca, medida, número de serie, condición (nueva/renovada) y kilometraje
   actual del vehículo para esa línea.
3. **Given** una línea cuyo producto es de tipo Servicio, **When** el usuario la agrega, **Then**
   el formulario captura fecha de próximo servicio y frecuencia (en kilómetros) para esa línea.
4. **Given** una línea cuyo producto es de tipo Producto o Refacción, **When** el usuario la
   agrega, **Then** el formulario captura una cantidad para esa línea.
5. **Given** el formulario de captura, **When** el usuario adjunta una factura (PDF o imagen)
   junto con el resto de los datos y guarda, **Then** la orden se crea con esa factura asociada.
6. **Given** el formulario de captura, **When** el usuario intenta guardar sin haber agregado
   ninguna línea, **Then** el sistema lo rechaza con un mensaje claro antes de guardar.
7. **Given** el selector de vehículo o de proveedor, **When** se despliega, **Then** no incluye
   vehículos dados de baja ni proveedores inactivos.
8. **Given** el selector de producto de una línea, **When** se despliega, **Then** no incluye
   productos de tipo Combustible.

---

### User Story 2 - Listado y búsqueda de órdenes de mantenimiento (Priority: P1)

Como administrador u operario con permiso `ver` en mantenimiento, quiero consultar y filtrar el
historial de órdenes capturadas, para revisar el mantenimiento correctivo y preventivo de la
flotilla.

**Why this priority**: Sin un listado consultable, la captura de la User Story 1 no genera valor
utilizable — es la otra mitad indispensable del mismo flujo básico.

**Independent Test**: Con varias órdenes ya capturadas (activas y canceladas, de distintos
vehículos, tipos, proveedores y fechas), aplicar cada filtro por separado y confirmar que el
listado muestra exactamente los registros esperados; abrir el detalle de una orden con varias
líneas y confirmar que todas aparecen con sus campos correctos.

**Acceptance Scenarios**:

1. **Given** el listado de órdenes de mantenimiento, **When** se filtra por vehículo, tipo,
   rango de fechas, proveedor o estado, **Then** se muestran únicamente las órdenes que cumplen
   ese filtro.
2. **Given** el listado, **When** se muestra una fila, **Then** incluye vehículo, tipo, fecha,
   costo total, estado y número de líneas.
3. **Given** una orden cancelada, **When** aparece en el listado, **Then** se muestra igual que
   las activas (no se oculta), con una marca visual que la distingue claramente como cancelada.
4. **Given** el detalle de una orden, **When** se abre, **Then** muestra todas sus líneas, cada
   una con los campos específicos de su tipo de producto (llanta/servicio/cantidad).
5. **Given** un vehículo dado de baja que tiene órdenes ya capturadas, **When** se despliega el
   filtro de vehículo del listado, **Then** ese vehículo no aparece como opción — pero sus
   órdenes siguen visibles en el listado general sin ese filtro aplicado.

---

### User Story 3 - Cancelar una orden de mantenimiento (Priority: P2)

Como administrador u operario con permiso `cancelar` en mantenimiento, quiero cancelar una orden
capturada por error o que ya no es válida, dejando constancia del motivo, para corregir el
historial sin borrar evidencia de lo ocurrido.

**Why this priority**: Es un flujo de corrección secundario — necesario, pero la feature ya
entrega valor completo (capturar y consultar) sin él.

**Independent Test**: Cancelar una orden activa con un motivo válido y confirmar que queda
`cancelado`, sin botón de reactivar y sin poder editar ningún campo (incluidas sus líneas y su
propio motivo) después; confirmar que un usuario sin el permiso `cancelar` no ve la acción
disponible.

**Acceptance Scenarios**:

1. **Given** una orden activa, **When** un usuario con permiso `cancelar` la cancela capturando
   un motivo (hasta 150 caracteres), **Then** la orden queda `cancelado` de forma permanente.
2. **Given** una orden activa, **When** un usuario con permiso `cancelar` intenta confirmar la
   cancelación sin capturar un motivo, **Then** el sistema lo bloquea y no cancela nada.
3. **Given** una orden ya cancelada, **When** se consulta su detalle, **Then** no existe ninguna
   acción para reactivarla, editar su motivo de cancelación, ni editar ninguna de sus líneas.
4. **Given** un usuario sin el permiso `cancelar` en el módulo mantenimiento (incluido un
   operario con solo `ver`/`crear`, los permisos por defecto), **When** consulta una orden
   activa, **Then** no ve disponible la acción de cancelar.

---

### Edge Cases

- ¿Qué pasa si se intenta guardar una orden sin ninguna línea? Se rechaza — una orden de
  mantenimiento MUST tener al menos una línea.
- ¿Qué pasa si dos líneas de la misma orden usan el mismo producto? Se acepta sin restricción —
  no hay unicidad de producto dentro de una orden (p. ej. dos refacciones distintas capturadas
  por separado, o una cantidad dividida en dos líneas).
- ¿Qué pasa si falla la subida de la factura durante la captura? La orden ya creada, con todas
  sus líneas, MUST conservarse sin factura — mismo criterio que Combustible: el archivo es un
  adjunto opcional, su fallo no revierte el registro principal.
- ¿Qué pasa si se intenta reemplazar la factura de una orden ya cancelada? Se rechaza — tras
  cancelar, el registro (incluido su archivo adjunto) queda completamente congelado, sin
  excepción para la factura.
- ¿Qué pasa si se elimina definitivamente el vehículo, el proveedor, o un producto referenciado
  por una línea de una orden ya capturada? Fuera de alcance de esta feature: la eliminación de
  vehículos/proveedores/productos con registros dependientes ya está bloqueada por la regla de
  integridad referencial general de esas features — una orden de mantenimiento (o una de sus
  líneas) cuenta como dependiente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir capturar una orden de mantenimiento con tipo
  (correctivo/preventivo), vehículo, proveedor, fecha, costo total y notas libres.
- **FR-002**: El selector de vehículo (tanto en el formulario de captura como en el filtro del
  listado) MUST excluir los vehículos dados de baja; el selector de proveedor MUST excluir los
  proveedores inactivos. Un vehículo dado de baja después de tener órdenes capturadas deja de ser
  filtrable por vehículo, pero su historial sigue visible en el listado general sin ese filtro.
- **FR-003**: La fecha de una orden MUST ser hoy o anterior; nunca una fecha futura.
- **FR-004**: El sistema MUST permitir agregar una o más líneas a la orden durante la captura,
  cada una asociada a un producto de tipo Servicio, Producto, Llanta o Refacción; el selector de
  producto de cada línea MUST excluir los productos de tipo Combustible. Una orden MUST tener al
  menos una línea para poder guardarse.
- **FR-005**: Una línea cuyo producto es de tipo Llanta MUST capturar marca, medida, número de
  serie, condición (nueva/renovada) y kilometraje actual del vehículo.
- **FR-006**: Una línea cuyo producto es de tipo Servicio MUST capturar fecha de próximo servicio
  y frecuencia (en kilómetros).
- **FR-007**: Una línea cuyo producto es de tipo Producto o Refacción MUST capturar una cantidad.
- **FR-008**: El costo total MUST capturarse como un único campo a nivel de la orden completa,
  sin autocálculo desde las líneas ni desglose de impuestos o costo por línea/producto.
- **FR-009**: El sistema MUST permitir adjuntar una factura (PDF o imagen) de forma opcional al
  momento de capturar.
- **FR-010**: Una vez guardada, una orden (y todas sus líneas) MUST ser inmutable en todos sus
  datos operativos y financieros (tipo, vehículo, proveedor, fecha, costo total, notas, y todos
  los campos de cada línea) — la única modificación posterior permitida es la transición de
  `estado` a `cancelado` y su `motivo_cancelacion` en el momento de cancelar.
- **FR-011**: El sistema MUST permitir reemplazar el archivo de factura de una orden mientras
  siga `activo`, conservando todas las versiones anteriores, sin que eso cuente como violación de
  la inmutabilidad de FR-010.
- **FR-012**: El sistema MUST permitir listar y filtrar órdenes de mantenimiento por vehículo,
  tipo, rango de fechas, proveedor y estado.
- **FR-013**: El listado MUST mostrar, por cada orden, vehículo, tipo, fecha, costo total, estado
  y número de líneas; las órdenes canceladas MUST mostrarse junto con las activas, distinguidas
  visualmente.
- **FR-014**: El detalle de una orden MUST mostrar todas sus líneas, cada una con los campos
  específicos de su tipo de producto (llanta, servicio, o cantidad).
- **FR-015**: El sistema MUST permitir cancelar una orden `activa` únicamente a usuarios con el
  permiso `cancelar` del módulo `mantenimiento` (administrador siempre; operario solo si se le
  otorgó explícitamente — no viene por defecto).
- **FR-016**: Cancelar una orden MUST exigir un motivo obligatorio (máximo 150 caracteres); el
  sistema MUST bloquear la confirmación si el motivo está vacío.
- **FR-017**: Una vez cancelada, una orden MUST quedar en ese estado de forma permanente — el
  sistema MUST NOT ofrecer ninguna acción para reactivarla, editar su motivo de cancelación, ni
  editar ninguna de sus líneas después de confirmada.
- **FR-018**: Si la subida de la factura falla durante la captura, el sistema MUST conservar la
  orden (con todas sus líneas) ya creada, sin bloquear ni revertir el registro completo.

### Key Entities

- **Orden de mantenimiento**: registro de un mantenimiento correctivo o preventivo de un
  vehículo — tipo, vehículo, proveedor, fecha, costo total, notas, factura adjunta (opcional, con
  historial de versiones), estado (`activo`/`cancelado`) y motivo de cancelación (solo si
  `cancelado`). Compuesta por una o más líneas. Inmutable salvo por la transición de estado y el
  reemplazo de la factura (agregando una nueva versión) mientras esté activa.
- **Línea de mantenimiento**: una fila de trabajo dentro de una orden — producto (de tipo
  Servicio, Producto, Llanta o Refacción, nunca Combustible), más los campos específicos de ese
  tipo (marca/medida/número de serie/condición/kilometraje para Llanta; fecha de próximo
  servicio/frecuencia para Servicio; cantidad para Producto/Refacción). Hereda la inmutabilidad
  de su orden — nunca se edita ni se elimina de forma independiente.

## Fuera de Alcance

- Reportes de costos de mantenimiento — pertenecen a una feature de Reportes futura, que necesita
  Mantenimiento (y Combustible) ya existiendo para tener datos que mostrar.
- Alertas de "próximo servicio" basadas en `servicio_fecha_proximo`/`servicio_frecuencia_km` —
  pertenecen a la feature de Alertas/Dashboard, que necesita esta feature ya con datos
  (constitución §4, misma excepción documentada ya para Vehículos/Conductores).
- Edición de cualquier dato operativo/financiero de la orden o de sus líneas tras la captura —
  por diseño, la única corrección posible es cancelar y capturar una orden nueva.
- Validación cruzada del kilometraje capturado en una línea de tipo Llanta contra el odómetro de
  Combustible o cualquier otra fuente — a diferencia del odómetro creciente de Combustible, esta
  feature no impone ninguna regla de consistencia sobre ese campo; ver Assumptions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las órdenes capturadas con datos válidos (incluidas todas sus líneas)
  quedan visibles de inmediato en el listado y en su propio detalle, con los datos correctos.
- **SC-002**: El 100% de los intentos de guardar una orden sin ninguna línea se rechazan antes de
  guardarse.
- **SC-003**: El 100% de las cancelaciones exigen un motivo capturado y son irreversibles — cero
  órdenes canceladas regresan a `activo`, cambian su motivo, o editan alguna de sus líneas
  después de confirmadas.
- **SC-004**: El 100% de los intentos de cancelar por parte de un usuario sin el permiso
  `cancelar` son bloqueados.
- **SC-005**: Un usuario puede localizar una orden específica combinando los filtros disponibles
  (vehículo, tipo, fecha, proveedor, estado), sin tener que recorrer el listado completo.

## Assumptions

- **Depende de `schema_10_mantenimiento_ajustes.sql`, aún sin aplicar**: agrega
  `mantenimiento_detalles.cantidad` (FR-007), `mantenimientos.motivo_cancelacion` (FR-016), y
  separa el trigger de inmutabilidad de mantenimientos del que hasta ahora compartía con
  `cargas_combustible` — esta feature MUST tratar esa migración como prerrequisito de
  Foundational, no asumir que ya existe.
- **Esquema base ya existente, sin cambios de alcance**: las tablas `mantenimientos` y
  `mantenimiento_detalles`, el bucket `documentos`, el módulo de permisos `mantenimiento`
  (`ver`/`crear`/`cancelar`, con `ver` y `crear` otorgados por defecto a todo operario nuevo — el
  mismo criterio ya confirmado para `combustible`) y el enum `tipo_mantenimiento`
  (`correctivo`/`preventivo`) existen desde la migración inicial del proyecto — esta feature no
  los crea, solo construye la UI y la lógica de negocio sobre ellos.
- **Una orden requiere al menos una línea**: sin ningún trabajo capturado, una "orden de
  mantenimiento" no describe nada — mismo criterio de integridad de datos que otras features de
  captura de este proyecto.
- **Sin validación cruzada de kilometraje**: el campo `llanta_kilometraje` se captura como un
  dato informativo de la línea, sin compararlo contra ningún historial (a diferencia del odómetro
  creciente de Combustible) — el brief de esta feature no lo pide, y no existe ninguna otra
  fuente de kilometraje con la que cruzarlo dentro de este alcance.
- **Auditoría**: siguiendo el mismo criterio aplicado a Combustible (007, corregido tras
  `/speckit-analyze` hallazgo A1), esta feature MUST verificar explícitamente durante `/speckit-plan`
  si `mantenimientos`/`mantenimiento_detalles` ya cuentan con su propio trigger de auditoría antes
  de asumir que "ya existe" — no se documenta aquí como resuelto sin esa verificación.
