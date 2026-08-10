# Feature Specification: Asignación Conductor-Vehículo

**Feature Branch**: `005-asignacion-conductor-vehiculo`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Feature 005 — Asignación Conductor-Vehículo. Depende de Feature 003 (Vehículos) y Feature 004 (Conductores) ya cerradas. Usa la tabla asignaciones_conductor_vehiculo (schema_06, ajustada para permitir el módulo conductores además de vehiculos). Permite vincular un conductor a un vehículo, con historial de vigencia. Un vehículo tiene un solo conductor activo a la vez (reemplazo automático al asignar otro); un conductor puede tener varios vehículos activos en paralelo, con advertencia (no bloqueo) al intentarlo."

## Resumen

Esta feature construye la capa de aplicación sobre `asignaciones_conductor_vehiculo`, tabla y RLS
que ya existen desde Feature 004 (creadas por decisión de `/speckit-clarify` de esa feature, para
que la eliminación de un conductor con dependientes fuera probable de punta a punta, y ampliadas
después para aceptar el permiso de ambos módulos). Permite vincular conductores y vehículos desde
ambos detalles (el del vehículo y el del conductor), con dos reglas de reemplazo distintas según
el lado desde el que se asigna, y un historial completo de vigencia en cada uno.

## Actores

- **Administrador**: acceso completo (asignar, reemplazar, finalizar) desde ambos detalles.
- **Operario**: requiere permiso `editar` otorgado explícitamente en el módulo `vehiculos` **o**
  en el módulo `conductores` — cualquiera de los dos alcanza, reflejando la política RLS ya
  vigente sobre `asignaciones_conductor_vehiculo` (Feature 004, migración
  `20260810004737_asignaciones_conductor_vehiculo_permiso_conductores.sql`). Sin ninguno de los
  dos, solo `ver` (si lo tiene) para consultar el historial, sin poder asignar.

## Clarifications

### Session 2026-08-10

- Q: Cuando se finaliza una asignación sin reemplazar (US-3) y el vehículo queda sin conductor,
  ¿debe reflejarse con un indicador en el listado principal de vehículos (Feature 003), o basta
  con que se vea en el propio detalle del vehículo? → A: Sí, indicador en el listado — le da al
  administrador visibilidad inmediata de qué vehículos necesitan conductor sin abrir cada uno,
  el caso de uso operativo más común de esta feature.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Esquema y RLS ya existen, no se crean en esta feature**: `asignaciones_conductor_vehiculo`
  (con su índice único parcial — un vehículo solo puede tener una asignación activa,
  `fecha_fin is null`, a la vez; ningún equivalente para conductor, que sí puede tener varias en
  paralelo por diseño) y sus políticas RLS ya están aplicadas. Esta feature solo construye la UI y
  la lógica de aplicación sobre esa base.
- **Se asigna desde ambos lados, con reglas de reemplazo distintas**: el detalle del vehículo
  tiene una pestaña "Conductor asignado" y el del conductor una pestaña "Vehículos asignados" —
  misma tabla subyacente, mismos datos, dos puntos de entrada con distinto comportamiento:
  - **Desde el vehículo (reemplazo automático, sin confirmación extra)**: un vehículo por
    definición no puede tener dos conductores activos a la vez (índice único parcial). Asignar un
    conductor nuevo cierra automáticamente la asignación anterior (`fecha_fin = hoy`) y abre la
    nueva — es el flujo normal de "cambiar conductor", sin fricción adicional.
  - **Desde el conductor, hacia un vehículo libre o ya asignado al mismo conductor (advertencia
    informativa, no bloqueante)**: si el conductor elegido ya tiene 1+ vehículos activos en
    otro(s) vehículo(s) — o si se asigna un vehículo adicional a un conductor que ya tiene
    otros —, se informa antes de confirmar, pero no se bloquea: un conductor sí puede tener varios
    vehículos activos en paralelo.
  - **Desde el conductor, hacia un vehículo con OTRO conductor activo (confirmación fuerte y
    obligatoria)**: a diferencia de los dos casos anteriores, esto exige una confirmación
    explícita ("El vehículo *Camión ABC-123* ya tiene asignado a *Juan Pérez*. ¿Deseas
    reemplazarlo por este conductor?") porque afecta la asignación activa de un **tercero**
    (otro conductor) que no está involucrado en la acción que el administrador está realizando —
    a diferencia del reemplazo automático (donde el "afectado" es el mismo vehículo que se está
    editando).
- **Finalizar sin reemplazar es una acción distinta de reemplazar**: desde cualquiera de los dos
  detalles, se puede terminar una asignación activa (`fecha_fin = hoy`) sin abrir una nueva —
  un vehículo puede quedar temporalmente sin conductor asignado.
- **Vehículos (003) tiene un gap real, corregido aquí**: al intentar eliminar un vehículo con
  dependientes, el sistema ya traduce el rechazo a un mensaje específico por tipo de dependiente
  (cargas de combustible, mantenimientos, checklists, servicios obligatorios) — pero no reconoce
  todavía `asignaciones_conductor_vehiculo` como uno de esos tipos, así que ese caso (ya
  técnicamente alcanzable desde que Feature 004 creó la tabla y su FK, aunque esta feature no
  existiera todavía) cae hoy en el mensaje genérico "tiene registros relacionados." Esta feature lo
  corrige (FR-012), mismo criterio que Conductores ya aplica para sus propias asignaciones.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrador asigna o reemplaza el conductor de un vehículo (Priority: P1)

Como administrador, quiero asignar un conductor a un vehículo desde el detalle del vehículo, y
poder reemplazarlo fácilmente cuando cambie, sin perder el historial de quién lo manejó antes.

**Why this priority**: Es el flujo principal y más frecuente — la mayoría de los cambios de
conductor ocurren desde la ficha del vehículo (rotación de personal sobre una unidad fija).

**Independent Test**: Asignar un conductor a un vehículo sin conductor previo; luego asignarle
otro distinto y confirmar que el primero queda cerrado (no vigente) en el historial, sin pedir
ninguna confirmación adicional.

**Acceptance Scenarios**:

1. **Given** un vehículo sin conductor asignado, **When** el administrador abre la pestaña
   "Conductor asignado" y elige uno de la lista de conductores activos, **Then** el conductor
   queda vigente para ese vehículo de inmediato.
2. **Given** un vehículo con un conductor ya asignado, **When** el administrador elige un
   conductor distinto, **Then** la asignación anterior se cierra automáticamente y la nueva queda
   vigente, sin ningún diálogo de confirmación adicional.
3. **Given** un conductor que ya tiene otro vehículo activo, **When** el administrador intenta
   asignarlo también a este vehículo, **Then** ve un mensaje informativo listando el otro vehículo
   antes de confirmar, y puede continuar o cancelar.
4. **Given** un vehículo con historial de dos o más conductores previos, **When** el administrador
   revisa la pestaña, **Then** ve el historial completo (conductor, fecha de inicio, fecha de fin
   o "Activo"), ordenado del más reciente al más antiguo.

---

### User Story 2 - Administrador asigna o reemplaza vehículos desde el detalle del conductor (Priority: P2)

Como administrador, quiero ver y gestionar los vehículos activos de un conductor desde su propia
ficha, incluyendo asignarle uno nuevo aunque ya tenga otros.

**Why this priority**: Complementa el flujo principal desde el ángulo del conductor — útil al dar
de alta o revisar la carga de trabajo de una persona específica, pero menos frecuente que
gestionar desde el vehículo.

**Independent Test**: Desde el detalle de un conductor con 0 vehículos activos, asignarle uno;
luego asignarle un segundo vehículo (sin conductor previo) y confirmar que ambos quedan activos en
paralelo; luego intentar asignarle un tercer vehículo que ya tiene otro conductor y confirmar que
se exige una confirmación explícita antes de proceder.

**Acceptance Scenarios**:

1. **Given** un conductor sin vehículos activos, **When** el administrador abre "Vehículos
   asignados" y usa "Asignar a otro vehículo" eligiendo uno sin dar de baja, **Then** el vehículo
   queda vinculado a ese conductor.
2. **Given** un conductor con un vehículo ya activo, **When** el administrador le asigna un
   segundo vehículo (sin conductor previo), **Then** ambos vehículos quedan activos en paralelo
   para ese conductor, sin bloqueo.
3. **Given** un vehículo que ya tiene activo a otro conductor, **When** el administrador intenta
   asignarlo a este conductor desde su detalle, **Then** el sistema exige una confirmación
   explícita indicando a quién se va a reemplazar, antes de proceder.
4. **Given** un conductor con historial en varios vehículos distintos, **When** el administrador
   revisa su pestaña, **Then** ve el historial completo a través de todos los vehículos que ha
   manejado, ordenado del más reciente al más antiguo.

---

### User Story 3 - Finalizar una asignación sin reemplazarla (Priority: P2)

Como administrador, quiero poder terminar la asignación activa de un conductor a un vehículo sin
tener que asignar inmediatamente a otro, para reflejar que el vehículo se quedó temporalmente sin
operador.

**Why this priority**: Necesario para mantener el historial correcto en situaciones reales (baja
temporal de personal, vehículo en mantenimiento prolongado) sin forzar una asignación de relleno.

**Independent Test**: Desde el detalle de un vehículo con conductor activo, finalizar la
asignación sin elegir un reemplazo, y confirmar que el vehículo queda sin conductor vigente, con
la asignación cerrada visible en el historial.

**Acceptance Scenarios**:

1. **Given** un vehículo con un conductor activo, **When** el administrador finaliza la
   asignación sin elegir un reemplazo, **Then** el vehículo queda sin conductor vigente, y esa
   asignación aparece cerrada (con fecha de fin) en el historial.
2. **Given** un conductor con un vehículo activo, **When** el administrador finaliza esa
   asignación desde el detalle del conductor, **Then** el vehículo deja de aparecer en la lista de
   vehículos activos de ese conductor, conservando el registro en el historial.
3. **Given** un vehículo que se quedó sin conductor tras finalizar su asignación, **When** el
   administrador abre el listado principal de vehículos, **Then** ese vehículo muestra un
   indicador visual de "sin conductor asignado" (Clarifications, sesión 2026-08-10).

---

### Edge Cases

- ¿Qué pasa si se intenta asignar al mismo conductor que ya está activo en ese vehículo? El
  selector no lo ofrece como opción (ya es el vigente, evita una reasignación sin efecto).
- ¿Qué pasa si dos administradores asignan conductores distintos al mismo vehículo casi al mismo
  tiempo? El índice único parcial ya existente (`fecha_fin is null` por `vehiculo_id`) garantiza
  consistencia a nivel de base de datos — la segunda escritura en completarse cierra
  correctamente la asignación que haya quedado activa en ese momento.
- ¿Qué pasa si se intenta eliminar definitivamente un vehículo o un conductor con asignaciones
  activas? Ya bloqueado por la foreign key existente (Vehículos FR-016/Conductores FR-016); esta
  feature agrega el mensaje específico para el caso del vehículo (FR-012, Conductores ya lo tenía).
- ¿Qué pasa si se finaliza la única asignación activa de un vehículo? Queda en estado "sin
  conductor asignado" en su propio detalle (ver Clarifications para el listado principal).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El administrador (u operario con permiso, FR-011) MUST poder asignar un conductor
  activo a un vehículo desde el detalle del vehículo.
- **FR-002**: Si el vehículo ya tenía un conductor activo, el sistema MUST cerrar automáticamente
  esa asignación (`fecha_fin` = hoy) y abrir la nueva, sin pedir confirmación adicional
  (reemplazo automático por vehículo).
- **FR-003**: Si el conductor elegido en FR-001 ya tiene uno o más vehículos activos en otras
  unidades, el sistema MUST mostrar un mensaje informativo listándolos antes de confirmar, sin
  bloquear la asignación.
- **FR-004**: El detalle del vehículo MUST mostrar el conductor actualmente asignado (o un estado
  vacío si no tiene ninguno) y el historial completo de asignaciones anteriores (conductor, fecha
  de inicio, fecha de fin o "Activo"), ordenado del más reciente al más antiguo.
- **FR-005**: El administrador (u operario con permiso) MUST poder asignar un vehículo que no esté
  dado de baja a un conductor, desde el detalle del conductor.
- **FR-006**: Si el vehículo elegido en FR-005 ya tiene activo a **otro** conductor, el sistema
  MUST exigir una confirmación explícita indicando a quién se reemplazará, antes de proceder — a
  diferencia de FR-002/FR-003, esta confirmación NO MUST poder omitirse, porque afecta la
  asignación activa de un tercero no involucrado en la acción.
- **FR-007**: El detalle del conductor MUST mostrar la lista de vehículos actualmente activos para
  ese conductor (puede ser ninguno, uno, o varios) y su historial completo de asignaciones a
  través de todos los vehículos que ha manejado, ordenado del más reciente al más antiguo.
- **FR-008**: Desde cualquiera de los dos detalles, el usuario MUST poder finalizar una asignación
  activa sin reemplazarla por otra.
- **FR-009**: El selector de conductores de FR-001 MUST excluir conductores desactivados y al
  conductor ya vigente para ese vehículo.
- **FR-010**: El selector de vehículos de FR-005 MUST excluir vehículos dados de baja y al
  vehículo ya vigente para ese conductor.
- **FR-011**: Un operario sin permiso de escritura otorgado explícitamente ni en el módulo
  `vehiculos` ni en el módulo `conductores` MUST poder consultar el historial de asignaciones
  (si tiene `ver` en cualquiera de los dos) pero NO MUST poder asignar, reemplazar ni finalizar
  ninguna asignación; con `editar` otorgado en cualquiera de los dos módulos MUST poder realizar
  todas las acciones de esta feature (refleja la política RLS ya vigente sobre
  `asignaciones_conductor_vehiculo`).
- **FR-012**: Al intentar eliminar definitivamente un vehículo con asignaciones registradas, el
  sistema MUST mostrar un mensaje específico ("tiene asignaciones registradas"), no el mensaje
  genérico de dependientes que muestra hoy (Decisiones Confirmadas, gap de Vehículos 003).
- **FR-013**: El listado principal de vehículos (Feature 003) MUST mostrar un indicador visual en
  los vehículos que no tienen conductor activo asignado, junto al indicador de vigencia de póliza
  ya existente (Clarifications, sesión 2026-08-10).

### Key Entities

- **Asignación Conductor-Vehículo**: entidad ya existente (`asignaciones_conductor_vehiculo`,
  creada por Feature 004), reutilizada tal cual por esta feature. Vincula un conductor con un
  vehículo, con fecha de inicio, fecha de fin opcional (`null` = activa) y quién la registró. Un
  vehículo tiene como máximo una fila activa a la vez (restricción de base de datos); un conductor
  puede tener varias.

## Fuera de Alcance

- Usar esta relación para inferir el "responsable" en checklists, mantenimiento u otras features
  — pendiente hasta que esas features se especifiquen (ya anotado en Feature 004).
- Notificaciones o alertas automáticas por cambios de asignación — no se pidió; puede agregarse
  después si se necesita.
- Filtro o búsqueda por "sin conductor asignado" en el listado de Vehículos — el indicador es
  visual (FR-013), no agrega un control de filtrado nuevo en esta feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede reasignar el conductor de un vehículo en menos de 1 minuto.
- **SC-002**: El 100% de los reemplazos de conductor por vehículo cierran automáticamente la
  asignación anterior, sin que quede más de una asignación activa simultánea para el mismo
  vehículo.
- **SC-003**: El 100% de los intentos de asignar, desde el vehículo, un conductor que ya tiene
  otro vehículo activo, muestran la advertencia informativa antes de confirmar.
- **SC-004**: El 100% de los intentos de asignar, desde el conductor, un vehículo que ya tiene
  otro conductor activo, exigen la confirmación explícita antes de proceder.
- **SC-005**: El historial de asignaciones de un vehículo y de un conductor permanece 100%
  accesible y completo después de cualquier número de reasignaciones o finalizaciones.
- **SC-006**: Un administrador puede identificar, sin abrir ningún vehículo, cuáles de ellos no
  tienen conductor asignado, con solo mirar el listado principal.

## Assumptions

- "Finalizar asignación" (FR-008) no requiere un diálogo de confirmación: es una acción no
  destructiva y reversible (se puede volver a asignar en cualquier momento) — a diferencia del
  reemplazo fuerte de FR-006, que sí la requiere porque afecta a un tercero.
- El selector de conductores/vehículos excluye la opción ya vigente para esa asignación (FR-009,
  FR-010) — evita una reasignación sin efecto real.
- El historial en ambos detalles se ordena de más reciente a más antigua, mismo criterio ya usado
  en el historial de póliza/licencia de Vehículos (003) y Conductores (004).
- La tabla `asignaciones_conductor_vehiculo` y su RLS (aceptando `tiene_permiso` de `vehiculos` O
  `conductores`) ya existen — esta feature no las crea, solo construye la capa de aplicación sobre
  ellas.
- No existe todavía una referencia visual de Stitch específica para las pantallas de esta feature;
  se seguirá el mismo lenguaje visual de `docs/design-system.md` y los patrones de layout ya
  construidos en Vehículos y Conductores (detalle en pestañas, historial en tabla) hasta que exista
  una referencia propia.
