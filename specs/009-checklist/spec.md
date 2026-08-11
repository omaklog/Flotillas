# Feature Specification: Checklist de Aditamentos y Revisión de Seguridad

**Feature Branch**: `009-checklist`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Feature 009 — Checklist de Aditamentos y Revisión de Seguridad:
revisión de seguridad previa a cada salida de un vehículo, con la lista de ítems determinada por
su tipo de vehículo (plantilla configurable por empresa), registrando quién la hizo (usuario) y
quién manejaba (conductor), de forma inmutable."

## Resumen

Administración de una plantilla de ítems de revisión de seguridad por tipo de vehículo (extintor,
botiquín, triángulos, etc.), y captura de checklists individuales antes de cada salida de un
vehículo: por cada ítem de su plantilla se marca cumple/no cumple con observaciones, se registra
quién hizo la revisión y qué conductor manejaba, y se elige un resultado general
(aprobado/con observaciones). Una vez guardado, el checklist es completamente **inmutable** — ni
se edita ni se cancela ni se borra.

## Actores

- **Administrador**: acceso completo — gestiona la plantilla de ítems por tipo de vehículo,
  captura y consulta checklists de su propia empresa (el rol `admin` siempre tiene todos los
  permisos de este módulo).
- **Operario**: tiene permiso `crear` en el módulo `checklist` otorgado por defecto (junto con
  `ver`) — puede capturar y consultar checklists sin configuración adicional. Gestionar la
  plantilla (alta/edición/eliminación de ítems) requiere el permiso `editar`, que un
  administrador debe otorgar explícitamente; no se concede por defecto.

## Clarifications

### Session 2026-08-11

- Q: Si un vehículo no tiene ningún ítem de plantilla configurado para su tipo, ¿se bloquea por
  completo hacer el checklist, o se permite capturarlo sin ítems (solo resultado general)? → A:
  Se bloquea — mismo criterio ya establecido en Combustible (FR-005, "sin productos de tipo
  combustible configurado") y Mantenimiento: el sistema muestra un mensaje claro dirigiendo a
  configurar la plantilla primero (US-9.1), en vez de permitir un checklist sin ningún ítem que
  revisar.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Plantilla de ítems por empresa y por tipo de vehículo**: el administrador define qué ítems
  aplican a cada tipo de vehículo (extintor, botiquín, triángulos, cintas reflectantes, llanta de
  repuesto, etc.), cada uno con un orden de despliegue y un flag "es crítico" (preparado para una
  futura regla de aprobación automática, no usado todavía — ver "Fuera de Alcance").
- **Conductor autocompletado, corregible**: al capturar un checklist, el conductor se llena
  automáticamente con el conductor activo de ese vehículo (la asignación vigente,
  Asignación Conductor-Vehículo, Feature 005) al momento de la revisión; si no coincide con la
  realidad (ej. no hay asignación activa, o alguien más está manejando temporalmente), quien hace
  el checklist puede corregirlo antes de guardar. El usuario que llenó el formulario (responsable)
  se registra por separado — pueden ser personas distintas.
- **Resultado manual por ahora**: el resultado general (aprobado/con observaciones) lo elige
  manualmente quien hace el checklist — el sistema no lo calcula ni lo fuerza a partir de los
  ítems marcados como críticos (ver "Fuera de Alcance").
- **Los ítems se copian a la captura, no se referencian en vivo**: cada checklist guarda su
  propia copia del nombre y la marca "es crítico" de cada ítem al momento de capturarse — editar
  o eliminar un ítem de la plantilla después **no** reinterpreta retroactivamente checklists ya
  hechos.
- **Inmutable desde el esquema original**: un checklist y sus ítems nunca se editan, cancelan ni
  eliminan una vez guardados — es un registro de cumplimiento normativo, no un borrador
  corregible. A diferencia de Combustible y Mantenimiento, no existe ninguna acción de
  "cancelar" para esta feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrador gestiona la plantilla de checklist por tipo de vehículo (Priority: P1)

Como administrador (u operario con permiso `editar` en checklist), quiero definir qué ítems se
revisan para cada tipo de vehículo de mi flotilla, para que cada checklist capturado revise
exactamente lo que corresponde a ese tipo de vehículo.

**Why this priority**: Sin una plantilla configurada, ningún checklist puede capturarse (ver
Clarifications) — es el prerrequisito de toda la feature.

**Independent Test**: Dar de alta varios ítems para un tipo de vehículo, confirmar que aparecen
en el orden capturado; editar uno; eliminar otro y confirmar que un checklist ya capturado
previamente con ese ítem conserva su copia intacta.

**Acceptance Scenarios**:

1. **Given** el tipo de vehículo "Vehículo ligero" sin ítems configurados, **When** el
   administrador agrega varios ítems (nombre, orden, marca "es crítico" opcional), **Then**
   quedan visibles en el orden indicado.
2. **Given** un ítem existente de la plantilla, **When** el administrador lo edita (nombre, orden,
   o "es crítico"), **Then** los cambios se guardan y se reflejan en futuros checklists de ese
   tipo de vehículo — sin afectar checklists ya capturados.
3. **Given** un ítem de la plantilla ya usado en al menos un checklist capturado, **When** el
   administrador lo elimina, **Then** se elimina de la plantilla (futuros checklists no lo
   incluyen) pero el checklist ya capturado sigue mostrando su copia del ítem sin cambios.

---

### User Story 2 - Realizar un checklist (Priority: P1)

Como administrador u operario con permiso `crear` en checklist, quiero capturar la revisión de
seguridad de un vehículo antes de su salida, marcando cada ítem de su plantilla y un resultado
general, para dejar constancia del cumplimiento normativo de la flotilla.

**Why this priority**: Es el núcleo de la feature — sin captura no hay checklists que consultar.

**Independent Test**: Con una plantilla ya configurada para el tipo de vehículo, capturar un
checklist completo (marcando cada ítem, con observaciones donde no cumple, y un resultado
general) y confirmar que queda guardado con todos sus datos correctos; intentar capturar para un
vehículo cuyo tipo no tiene plantilla configurada y confirmar que se bloquea con un mensaje claro.

**Acceptance Scenarios**:

1. **Given** el formulario de captura, **When** el usuario selecciona un vehículo activo, **Then**
   la plantilla de ítems correspondiente a su tipo de vehículo se carga automáticamente.
2. **Given** un vehículo con una asignación de conductor activa, **When** se abre el formulario de
   captura, **Then** el conductor aparece precargado, editable antes de guardar.
3. **Given** un vehículo sin ninguna asignación de conductor activa, **When** se abre el
   formulario de captura, **Then** el campo de conductor queda vacío, y el usuario puede
   seleccionarlo manualmente antes de guardar.
4. **Given** el formulario de captura con la plantilla cargada, **When** el usuario marca cada
   ítem como cumple/no cumple, captura observaciones donde no cumple, elige un resultado general,
   y guarda, **Then** el checklist se crea con una copia de cada ítem tal como estaba al momento
   de la captura.
5. **Given** un ítem marcado como "no cumple", **When** el usuario intenta guardar sin capturar
   observaciones para ese ítem, **Then** el sistema lo rechaza con un mensaje claro antes de
   guardar.
6. **Given** un vehículo cuyo tipo de vehículo no tiene ningún ítem de plantilla configurado,
   **When** el usuario intenta capturar un checklist para ese vehículo, **Then** el sistema
   bloquea la captura con un mensaje claro dirigiendo a configurar la plantilla primero (US-9.1).
7. **Given** el selector de vehículo, **When** se despliega, **Then** no incluye vehículos dados
   de baja.

---

### User Story 3 - Consultar checklists realizados (Priority: P2)

Como administrador u operario con permiso `ver` en checklist, quiero consultar el historial de
checklists capturados y el detalle de cada uno, para revisar el cumplimiento de seguridad de la
flotilla.

**Why this priority**: Es un flujo de consulta — necesario, pero la feature ya entrega su valor
principal (dejar constancia) sin él; es P2 porque depende de que ya existan checklists
capturados (US-9.2).

**Independent Test**: Con varios checklists ya capturados (de distintos vehículos, conductores,
fechas y resultados), aplicar cada filtro por separado y confirmar que el listado muestra
exactamente los registros esperados; abrir el detalle de uno y confirmar que muestra todos sus
ítems, el usuario responsable y el conductor.

**Acceptance Scenarios**:

1. **Given** el listado de checklists, **When** se filtra por vehículo, por rango de fechas, por
   resultado o por conductor, **Then** se muestran únicamente los checklists que cumplen ese
   filtro.
2. **Given** el detalle de un checklist, **When** se abre, **Then** muestra todos sus ítems con su
   estado (cumple/no cumple) y observaciones, el usuario que lo realizó, el conductor registrado,
   la fecha, y el resultado general.

---

### Edge Cases

- ¿Qué pasa si un ítem sin marcar "es crítico" no cumple? Se captura igual — la marca "es
  crítico" no bloquea ni cambia el flujo de captura en esta feature (ver Fuera de Alcance); es
  solo un dato que se copia al checklist.
- ¿Qué pasa si se intenta capturar un checklist sin seleccionar un resultado general? Se
  rechaza — el resultado general es obligatorio en toda captura.
- ¿Qué pasa si el vehículo tiene más de una asignación de conductor activa? No ocurre por diseño
  — Asignación Conductor-Vehículo (Feature 005) garantiza como máximo una asignación activa por
  vehículo a la vez.
- ¿Qué pasa si se elimina definitivamente un tipo de vehículo con ítems de plantilla asociados?
  Fuera de alcance de esta feature: la eliminación de tipos de vehículo con dependientes ya está
  bloqueada por la regla de integridad referencial de Catálogos Base (002).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir al administrador (u operario con permiso `editar`) dar de
  alta ítems de plantilla de checklist para un tipo de vehículo, con nombre, orden de despliegue,
  y una marca opcional "es crítico".
- **FR-002**: El sistema MUST permitir editar (nombre, orden, "es crítico") y eliminar ítems de
  la plantilla; ninguna de las dos acciones MUST afectar checklists ya capturados (FR-008).
- **FR-003**: El sistema MUST permitir capturar un checklist seleccionando un vehículo activo (el
  selector MUST excluir los dados de baja); la plantilla de ítems se MUST cargar automáticamente
  según el tipo de vehículo seleccionado.
- **FR-004**: Si el tipo de vehículo seleccionado no tiene ningún ítem de plantilla configurado,
  el sistema MUST bloquear la captura con un mensaje claro dirigiendo a configurar la plantilla
  primero (Clarifications, sesión 2026-08-11).
- **FR-005**: El sistema MUST autocompletar el conductor del checklist con el conductor de la
  asignación activa del vehículo seleccionado (si existe); el campo MUST permanecer editable
  antes de guardar, incluido el caso sin asignación activa (campo vacío, selección manual
  requerida).
- **FR-006**: El sistema MUST registrar, además del conductor, al usuario que realiza la captura
  (responsable) — ambos MUST poder ser personas distintas.
- **FR-007**: Por cada ítem de la plantilla cargada, el sistema MUST permitir marcar
  cumple/no cumple y capturar observaciones; las observaciones MUST ser obligatorias cuando el
  ítem se marca como "no cumple".
- **FR-008**: Al guardar, el checklist MUST copiar el nombre y la marca "es crítico" de cada
  ítem de la plantilla tal como estaban en ese momento, sin referenciar la plantilla en vivo —
  cambios posteriores a la plantilla (FR-002) no MUST reinterpretar checklists ya capturados.
- **FR-009**: El sistema MUST exigir la selección de un resultado general (aprobado/con
  observaciones) antes de guardar un checklist.
- **FR-010**: Una vez guardado, un checklist (y todos sus ítems) MUST ser completamente
  inmutable — el sistema MUST NOT ofrecer ninguna acción de edición, cancelación, ni borrado.
- **FR-011**: El sistema MUST permitir listar y filtrar checklists por vehículo, rango de fechas,
  resultado y conductor.
- **FR-012**: El detalle de un checklist MUST mostrar todos sus ítems (con su estado y
  observaciones), el usuario responsable, el conductor, la fecha, y el resultado general.

### Key Entities

- **Ítem de plantilla de checklist**: define qué se revisa para un tipo de vehículo — nombre,
  orden de despliegue, marca "es crítico" (sin efecto funcional en esta feature). Pertenece a un
  tipo de vehículo de una empresa.
- **Checklist**: revisión de seguridad de un vehículo — vehículo, tipo de vehículo (al momento de
  la captura), conductor, usuario responsable, fecha, resultado general (aprobado/con
  observaciones). Compuesto por una o más líneas de ítem. Inmutable desde su creación.
- **Ítem de checklist**: copia congelada de un ítem de plantilla dentro de un checklist ya
  capturado — nombre, marca "es crítico", si cumple o no, observaciones. Independiente de la
  plantilla tras capturarse.

## Fuera de Alcance

- Regla automática de aprobación basada en la marca "es crítico" (ej. "si algún ítem crítico no
  cumple, forzar resultado 'con observaciones'") — el dato queda disponible en el modelo para una
  iteración futura, pero esta feature no implementa ninguna lógica automática sobre él; el
  resultado general siempre es una decisión manual.
- Bloquear la salida operativa de un vehículo cuando su checklist más reciente tiene
  observaciones — no se pidió; sería una integración con una futura feature de Alertas/Dashboard.
- Reportes o tendencias de cumplimiento a través del tiempo — pertenecen a una futura feature de
  Reportes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los checklists capturados con datos válidos quedan visibles de inmediato
  en el listado y en su propio detalle, con los datos y la copia de ítems correctos.
- **SC-002**: El 100% de los intentos de capturar un checklist para un vehículo cuyo tipo no tiene
  plantilla configurada se bloquean antes de guardar.
- **SC-003**: El 100% de los intentos de guardar un ítem marcado "no cumple" sin observaciones se
  rechazan antes de guardar.
- **SC-004**: El 100% de los checklists ya guardados permanecen sin ninguna acción de edición o
  borrado disponible — cero checklists modificados después de su captura.
- **SC-005**: Un usuario puede localizar un checklist específico combinando los filtros
  disponibles (vehículo, fecha, resultado, conductor), sin tener que recorrer el listado
  completo.

## Assumptions

- **Depende de `schema_11_checklist_plantillas.sql`, aún sin aplicar**: agrega la tabla
  `checklist_item_plantillas`, las acciones `editar`/`eliminar` del módulo `checklist` (antes
  solo tenía `ver`/`crear`), el campo de conductor en `checklists`, y los campos de copia
  (`es_critico`, referencia a la plantilla de origen) en los ítems de checklist — esta feature
  MUST tratar esa migración como prerrequisito de Foundational, no asumir que ya existe.
- **Esquema base ya existente, sin cambios de alcance**: las tablas `checklists`/`checklist_items`
  (inmutables desde el diseño original — `checklists_no_update`/`_no_delete`,
  `checklist_items_no_update`/`_no_delete`), el módulo de permisos `checklist`
  (`ver`/`crear` otorgados por defecto a todo operario nuevo) y el enum `resultado_checklist`
  (`aprobado`/`con_observaciones`) existen desde la migración inicial del proyecto — esta feature
  no los crea, solo construye la UI y la lógica de negocio sobre ellos.
- **Conductor activo**: se obtiene de la asignación vigente en `asignaciones_conductor_vehiculo`
  (Feature 005), que garantiza como máximo una asignación activa por vehículo — sin necesidad de
  desambiguar entre varias.
- **Plantilla por tipo de vehículo, no por vehículo individual**: dos vehículos del mismo tipo
  comparten exactamente la misma plantilla — no se pidió (ni el esquema lo soporta) configurar
  ítems distintos para vehículos individuales del mismo tipo.
