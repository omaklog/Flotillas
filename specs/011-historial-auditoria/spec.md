# Feature Specification: Historial por Vehículo y Bitácora de Auditoría

**Feature Branch**: `011-historial-auditoria`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Feature 011 — Historial por Vehículo y Bitácora de Auditoría: dos
vistas distintas de US-14 (Bitácora de auditoría) del documento de entendimiento original — (1)
línea de tiempo operativa por vehículo, armada con UNION directo sobre las tablas de negocio, sin
tocar auditoria; (2) bitácora de auditoría técnica de cumplimiento, exclusiva de
administrador/superusuario, sobre la tabla auditoria ya poblada automáticamente."

## Resumen

Dos pantallas distintas que resuelven necesidades distintas, aunque ambas parten de "qué pasó":
(1) una pestaña "Actividad" dentro del detalle de cada vehículo, con la línea de tiempo operativa
de todo lo que le pasó (cargas de combustible, mantenimientos, checklists, servicios
obligatorios, cambios de conductor asignado), útil para cualquiera que dé seguimiento a ese
vehículo; y (2) una bitácora de auditoría técnica, separada, exclusiva de
administrador/superusuario, que muestra quién cambió qué y cuándo en cualquier tabla del sistema,
pensada para investigar incidentes de cumplimiento, no para uso operativo diario.

## Actores

- **Cualquier usuario con permiso `ver` en el módulo `vehiculos`** (administrador, o operario con
  ese permiso — otorgado por defecto): puede consultar la línea de tiempo de cualquier vehículo de
  su empresa que ya pueda ver (US-11.1) — mismo permiso que ya usa para ver el vehículo, sin
  configuración adicional.
- **Administrador y superusuario únicamente**: pueden consultar la bitácora de auditoría técnica
  (US-11.2) — ningún operario tiene acceso, ni siquiera con permisos otorgados explícitamente (la
  tabla `auditoria` ya restringe su lectura a `rol() = 'admin'`/superusuario desde su diseño
  original, sin acción granular por módulo).

## Clarifications

### Session 2026-08-11

- Q: La línea de tiempo del vehículo, ¿debe incluir también los eventos de `auditoria` sobre el
  propio vehículo (ej. "se editó el número de póliza", "se dio de baja"), o se queda solo con los
  eventos operativos de las 5 tablas relacionadas (cargas, mantenimientos, checklists, servicios
  obligatorios, cambios de conductor)? → A: Solo las 5 fuentes operativas — más simple y
  consistente con la decisión ya confirmada de no construir la línea de tiempo desde `auditoria`;
  evita mezclar eventos de negocio con resumen rico con filas genéricas de auditoría en una sola
  lista, y evita exponer a cualquier operario con permiso `ver` en `vehiculos` datos que hoy están
  restringidos a administrador/superusuario. Los cambios al propio vehículo (póliza, baja,
  reactivación, etc.) siguen consultables por un administrador en la Bitácora de Auditoría
  (US-11.2), solo que no aparecen mezclados en esta vista operativa.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **La línea de tiempo (US-11.1) NO se construye consultando `auditoria`**: se arma combinando
  directamente `cargas_combustible`, `mantenimientos`, `checklists`, `servicios_obligatorios`, y
  `asignaciones_conductor_vehiculo`, filtrando por `vehiculo_id` de esa empresa y ordenando por
  fecha (más reciente primero). Estas 5 tablas ya tienen (o casi) el índice que este patrón de
  consulta necesita — ver Assumptions.
- **La bitácora de auditoría (US-11.2) sí usa la tabla `auditoria`**, que ya existe en el esquema
  desde el diseño original pero, hasta antes de esta feature, no estaba poblada de forma
  automática y consistente en todas las tablas — ver Assumptions para el estado real encontrado
  durante la redacción de este documento (difiere de lo que el brief original asumía).
- **`accion` distingue tanto como el trigger de cada tabla lo permita, nunca más**: para las
  tablas cuyo trigger de auditoría es la función genérica (la mayoría — Proveedores, Productos,
  Checklist, Servicios Obligatorios, Tipos de Vehículo, etc.), `accion='editar'` es
  intencionalmente genérico y no distingue, por ejemplo, "dar de baja un producto" de "cambiar su
  nombre" — ambos quedan como `editar`. Para las tablas con un trigger dedicado (Vehículos:
  `crear`/`editar`/`desactivar`/`reactivar`; Combustible y Mantenimiento: `crear`/`editar`/
  `cancelar`), esas transiciones específicas SÍ tienen su propio valor de `accion`, distinto de
  `editar` — el filtro de acción de la bitácora de auditoría (FR-006) MUST ofrecer los 6 valores
  reales del catálogo (`crear`/`editar`/`eliminar`/`cancelar`/`desactivar`/`reactivar`), no solo
  los 4 más comunes. En cualquiera de los dos casos, el detalle real de qué campo cambió vive en
  las columnas `valores_antes`/`valores_despues` (el estado completo del registro antes y
  después, no solo los campos modificados) — el diff (FR-009) se calcula de la misma forma sin
  importar cuál de los 6 valores de `accion` tenga el evento, siempre que ambos lados estén
  presentes. Es responsabilidad de la UI de la bitácora de auditoría (US-11.2) calcular y mostrar
  ese diff legible, no de la base de datos adivinar la intención de cada cambio.
- **Los eventos de la línea de tiempo enlazan a su propio detalle**, no se muestran expandidos
  in-place: un click navega al detalle completo de ese registro en su feature correspondiente
  (Combustible, Mantenimiento, Checklist, o Servicios Obligatorios). Los cambios de conductor
  asignado son la excepción — no tienen una página de detalle propia; su evento en la línea de
  tiempo enlaza a la pestaña "Conductor Asignado" ya existente en el propio detalle del vehículo
  (Feature 005), no a una ruta nueva.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consultar la línea de tiempo de un vehículo (Priority: P1)

Como usuario con acceso a un vehículo (administrador, o operario con permiso `ver` en
`vehiculos`), quiero ver en un solo lugar todo lo que le ha pasado a ese vehículo — cargas de
combustible, mantenimientos, checklists, servicios obligatorios, y cambios de conductor —
ordenado cronológicamente, para dar seguimiento a su operación sin tener que revisar cada módulo
por separado.

**Why this priority**: Es el valor operativo diario de la feature — la razón principal por la
que alguien la usaría en el día a día, a diferencia de la bitácora de auditoría (US-11.2), que es
para casos excepcionales.

**Independent Test**: Con un vehículo que ya tiene registros en varias de las 5 fuentes (al menos
una carga de combustible, un mantenimiento, un checklist, un servicio obligatorio, y un cambio de
conductor), abrir su pestaña "Actividad" y confirmar que aparecen los 5 tipos de evento,
ordenados del más reciente al más antiguo, cada uno con un resumen correcto; hacer click en uno y
confirmar que navega a su detalle completo.

**Acceptance Scenarios**:

1. **Given** un vehículo con registros en varias de las 5 fuentes, **When** se abre su pestaña
   "Actividad", **Then** se muestran todos, mezclados en una sola lista ordenada del más reciente
   al más antiguo.
2. **Given** la línea de tiempo de un vehículo, **When** se muestra cada evento, **Then** cada uno
   tiene un ícono/color distintivo según su tipo, y un resumen de una línea con sus datos más
   relevantes (ej. "Carga de combustible — 45 L — $1,200").
3. **Given** un evento de carga de combustible, mantenimiento, checklist, o servicio obligatorio
   en la línea de tiempo, **When** se hace click sobre él, **Then** navega al detalle completo de
   ese registro en su feature correspondiente.
4. **Given** un evento de cambio de conductor asignado en la línea de tiempo, **When** se hace
   click sobre él, **Then** navega a la pestaña "Conductor Asignado" del propio vehículo.
5. **Given** un vehículo sin ningún evento en ninguna de las 5 fuentes, **When** se abre su
   pestaña "Actividad", **Then** se muestra un mensaje claro de que no hay eventos, no una lista
   vacía sin explicación.
6. **Given** la pestaña "Actividad", **When** el usuario que la consulta es un operario con
   permiso `ver` en `vehiculos` (no administrador), **Then** puede consultarla igual que el
   administrador, sin necesidad de ningún permiso adicional.

---

### User Story 2 - Consultar la bitácora de auditoría (Priority: P2)

Como administrador o superusuario, quiero consultar quién cambió qué, cuándo, en cualquier tabla
del sistema, filtrando por entidad, usuario, acción, y rango de fechas, para investigar
incidentes de cumplimiento o dudas de seguridad (ej. "¿quién le quitó el permiso de editar a este
operario y cuándo?").

**Why this priority**: Es una herramienta de cumplimiento/seguridad para casos excepcionales, no
de uso diario — el valor principal de la feature (US-11.1) no depende de esta historia.

**Independent Test**: Con varios eventos de auditoría ya generados (de distintas entidades,
usuarios, acciones, y fechas — generados automáticamente por el uso normal del sistema, no
capturados a mano), aplicar cada filtro por separado y confirmar que el listado muestra
exactamente los eventos esperados; expandir uno con un `UPDATE` y confirmar que el diff mostrado
señala correctamente solo los campos que cambiaron.

**Acceptance Scenarios**:

1. **Given** la bitácora de auditoría, **When** se filtra por entidad (tabla), usuario, acción
   (crear/editar/eliminar/cancelar/desactivar/reactivar — los 6 valores reales del catálogo, ver
   Decisiones y Restricciones Confirmadas), o rango de fechas, **Then** se muestran únicamente
   los eventos que cumplen ese filtro.
2. **Given** un evento de auditoría en el listado, **When** se muestra su fila, **Then** indica
   usuario, fecha/hora, entidad, y acción, sin necesidad de expandirlo.
3. **Given** un evento de auditoría de tipo `editar` (con `valores_antes` y `valores_despues`
   ambos presentes), **When** se expande, **Then** se muestra un diff legible — solo los campos
   cuyo valor cambió, con su valor anterior y nuevo — no el JSON completo de ambos estados.
4. **Given** un evento de auditoría de tipo `crear` (sin `valores_antes`) o `eliminar` (sin
   `valores_despues`), **When** se expande, **Then** se muestra el estado del registro de forma
   legible, sin intentar calcular un diff contra un lado inexistente.
5. **Given** la bitácora de auditoría, **When** un operario (con cualquier combinación de
   permisos otorgados) intenta acceder a ella, **Then** el sistema se lo impide — esta pantalla
   es exclusiva de administrador y superusuario, sin excepción otorgable.

---

### Edge Cases

- ¿Qué pasa si dos eventos de fuentes distintas ocurrieron en el mismo instante exacto (misma
  fecha/hora)? El orden entre ellos es indistinto — no hay un criterio de desempate declarado más
  allá de "más reciente primero" a nivel de fecha.
- ¿Qué pasa con un vehículo que tiene un volumen muy alto de eventos acumulados (cientos)? La
  línea de tiempo MUST paginar o limitar la carga inicial — no se espera renderizar cientos de
  filas de una sola vez (ver Success Criteria).
- ¿Qué pasa si un registro referenciado por un evento de la línea de tiempo (ej. una carga de
  combustible) fue eliminado? No aplica a Combustible/Mantenimiento/Checklist/Servicios
  Obligatorios, ya que ninguno de ellos permite eliminación física salvo Servicios Obligatorios
  (Feature 010, libre); si el registro fue eliminado, el evento correspondiente simplemente deja
  de aparecer en la línea de tiempo (se arma en vivo desde las tablas de origen, no desde una
  copia).
- ¿Qué pasa con un evento de `auditoria` sobre una entidad que ya no existe (fue eliminada
  después)? La bitácora de auditoría (US-11.2) sigue mostrando el evento igual — es un registro
  histórico de lo que pasó, independiente de si la entidad involucrada sigue existiendo.
- ¿Qué pasa si `valores_antes`/`valores_despues` contienen columnas técnicas que no aportan al
  diff (ej. `updated_at`, que cambia en cada `UPDATE` por diseño)? El diff MUST excluir columnas
  puramente técnicas de timestamp de fila (`updated_at`), para no ensuciar el diff con "cambios"
  que no reflejan una decisión del usuario.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST mostrar, en una pestaña "Actividad" del detalle de cada vehículo,
  una línea de tiempo cronológica (más reciente primero) que combine los eventos de cargas de
  combustible, mantenimientos, checklists, servicios obligatorios, y cambios de conductor
  asignado de ese vehículo. La línea de tiempo MUST NOT incluir eventos de `auditoria` sobre el
  propio vehículo (ej. ediciones de sus datos, baja, reactivación) — esos quedan exclusivamente
  en la Bitácora de Auditoría (FR-006, Clarifications sesión 2026-08-11).
- **FR-002**: Cada evento de la línea de tiempo MUST mostrar un ícono/color distintivo según su
  tipo y un resumen de una línea con sus datos más relevantes.
- **FR-003**: Un click sobre un evento de carga de combustible, mantenimiento, checklist, o
  servicio obligatorio MUST navegar al detalle completo de ese registro; un click sobre un evento
  de cambio de conductor asignado MUST navegar a la pestaña "Conductor Asignado" del vehículo.
- **FR-004**: La línea de tiempo MUST ser accesible para cualquier usuario que ya tenga permiso
  `ver` en el módulo `vehiculos` (administrador, o operario con ese permiso, otorgado por
  defecto) — sin ningún permiso adicional que configurar.
- **FR-005**: Si un vehículo no tiene ningún evento en ninguna de las 5 fuentes, el sistema MUST
  mostrar un mensaje claro de "sin eventos", no una lista vacía sin explicación.
- **FR-006**: El sistema MUST proveer una pantalla de bitácora de auditoría, separada del detalle
  de cualquier entidad, que permita listar y filtrar eventos de auditoría por entidad (tabla),
  usuario, acción (los 6 valores reales del catálogo — `crear`/`editar`/`eliminar`/`cancelar`/
  `desactivar`/`reactivar`), y rango de fechas. Cuando se combina más de un filtro a la vez,
  todos MUST cumplirse simultáneamente (AND), no basta con que se cumpla alguno.
- **FR-007**: La bitácora de auditoría MUST ser accesible únicamente para administrador y
  superusuario — ningún operario MUST poder acceder a ella, sin importar los permisos otorgados.
- **FR-008**: Cada fila de la bitácora de auditoría MUST mostrar, sin necesidad de expandirla:
  usuario, fecha/hora, entidad, y acción.
- **FR-009**: Al expandir un evento de auditoría con ambos lados presentes (`valores_antes` y
  `valores_despues`), el sistema MUST calcular y mostrar un diff legible — únicamente los campos
  cuyo valor cambió, con su valor anterior y nuevo — excluyendo columnas puramente técnicas de
  timestamp de fila (`updated_at`). Esta regla depende únicamente de que ambos lados estén
  presentes, no del valor de `accion` — aplica igual a `editar`, `cancelar`, `desactivar`, y
  `reactivar` (los 4 valores del catálogo cuya transición real siempre deja ambos lados
  poblados).
- **FR-010**: Al expandir un evento de auditoría con un solo lado presente (creación, sin
  `valores_antes`; o eliminación, sin `valores_despues`), el sistema MUST mostrar el estado
  disponible de forma legible, sin intentar calcular un diff.

### Key Entities

- **Evento de línea de tiempo**: representación unificada, en memoria/consulta (no una tabla
  nueva), de un registro de cualquiera de las 5 fuentes relacionadas con un vehículo — tipo de
  evento, fecha, resumen, y una referencia a su registro de origen para poder navegar a su
  detalle.
- **Evento de auditoría**: fila ya existente de `public.auditoria` — empresa, usuario, entidad
  (nombre de tabla), id de la entidad afectada, acción, estado antes y después (JSON).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario puede identificar el evento más reciente de un vehículo (de cualquiera
  de las 5 fuentes) sin tener que visitar más de una pantalla.
- **SC-002**: La línea de tiempo de un vehículo con un volumen alto de eventos (cientos)
  permanece navegable sin degradación perceptible — mismo criterio de paginación ya aplicado en
  los listados de cada módulo individual.
- **SC-003**: Un administrador puede localizar un evento de auditoría específico combinando los
  filtros disponibles (entidad, usuario, acción, rango de fechas), sin tener que recorrer el
  listado completo.
- **SC-004**: El 100% de los eventos de auditoría de tipo `editar` muestran un diff que refleja
  exactamente los campos que cambiaron — ni de más (columnas técnicas), ni de menos.
- **SC-005**: El 100% de los intentos de un operario (con cualquier combinación de permisos) de
  acceder a la bitácora de auditoría son bloqueados.

## Assumptions

- **El estado real de la auditoría automática difiere de lo que asumía la descripción original de
  esta feature**: el brief indicaba que `schema_13_bitacora_auditoria_automatica.sql` poblaría
  `auditoria` automáticamente "en prácticamente todas las tablas de negocio" mediante un trigger
  genérico nuevo aplicado en bloque sobre 19 tablas. Al revisar el estado real del esquema
  durante la redacción de este documento, se encontró que **las 19 tablas que ese script intenta
  conectar ya tienen, cada una, su propio trigger de auditoría dedicado**, agregado
  incrementalmente por cada feature anterior (001 a 010) conforme se fue construyendo — Vehículos
  con `audit_vehiculos()` (distingue dar de baja/reactivar de editar), Combustible y
  Mantenimiento con sus propias funciones (distinguen cancelar de editar), y el resto (Checklist,
  Servicios Obligatorios, Catálogos Base, Conductores, Proveedores/Productos, Asignación
  Conductor-Vehículo) con la función genérica `private.audit_catalogo()`. Aplicar el script tal
  cual, como sugería la descripción original, duplicaría un trigger de auditoría sobre cada una
  de esas 19 tablas — cada `insert`/`update`/`delete` generaría **dos** filas en `auditoria` en
  vez de una, rompiendo silenciosamente cualquier código o prueba que asuma una fila por evento.
  La única pieza de ese script que sigue faltando y no está duplicada es el trigger sobre
  `usuario_permisos` (insert/delete, sin trigger previo — ninguna feature anterior lo agregó).
  `/speckit-plan` MUST tratar la auditoría de las 19 tablas de negocio como **ya completa**, y
  limitar el trabajo de esquema de esta feature al trigger de `usuario_permisos` únicamente. Esto
  no estaba anticipado en la descripción original ("requiere schema_13... poblada
  automáticamente"), y se documenta aquí por haberse descubierto durante la redacción de este
  spec, no durante `/speckit-clarify`.
- **Índice compuesto de `asignaciones_conductor_vehiculo` distinto al de las otras 4 fuentes**:
  las 4 tablas de captura (`cargas_combustible`, `mantenimientos`, `checklists`,
  `servicios_obligatorios`) tienen el índice `(empresa_id, vehiculo_id, fecha[_realizado] desc)`
  que este patrón de consulta necesita (`schema_04_indices.sql`, ya confirmado por el propio
  brief). `asignaciones_conductor_vehiculo` en cambio tiene `(vehiculo_id, fecha_inicio desc)` —
  sin `empresa_id` en el índice, y usa `fecha_inicio` (no existe una columna `fecha` única en esa
  tabla). Sigue siendo utilizable para este patrón de consulta, pero `/speckit-plan` MUST tenerlo
  presente al diseñar la consulta combinada — no es una réplica exacta de las otras 4.
- **`auditoria` ya tiene su propia RLS restringida a administrador/superusuario desde el diseño
  original del esquema** — no se abre a ningún permiso granular por módulo (a diferencia de las
  demás tablas de negocio); esta feature no modifica esa política.
