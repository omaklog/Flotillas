# Feature Specification: Bitácora de Servicios Obligatorios

**Feature Branch**: `010-servicios-obligatorios`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Feature 010 — Bitácora de Servicios Obligatorios: registro de
servicios obligatorios de cumplimiento normativo por vehículo (revisiones físico-mecánicas,
verificaciones ambientales, renovación de aditamentos de seguridad), cada uno con su propia fecha
de vencimiento, para prevenir sanciones. A diferencia de Combustible/Mantenimiento, no es
inmutable — es un registro administrativo editable y eliminable libremente."

## Resumen

Bitácora por vehículo de los 3 servicios obligatorios de cumplimiento normativo que toda flotilla
debe mantener vigentes: revisión físico-mecánica, verificación ambiental, y renovación de
aditamentos de seguridad. Cada registro guarda cuándo se realizó, cuándo vence, y opcionalmente
el comprobante/certificado que lo acredita. A diferencia de Combustible (007) y Mantenimiento
(008), no es un registro financiero ni requiere trazabilidad de cancelación — es editable y
eliminable libremente por quien tenga permiso.

## Actores

- **Administrador**: acceso completo por rol — registra, edita, elimina y consulta servicios
  obligatorios de su propia empresa, sin necesidad de que se le otorgue ningún permiso adicional.
- **Operario**: tiene el permiso `ver` en el módulo `servicios_obligatorios` otorgado por
  defecto — puede consultar el listado y el detalle sin configuración adicional. Registrar,
  editar y eliminar requieren que un administrador le otorgue el permiso `editar` explícitamente;
  no se concede por defecto. **Nota de permisos**: aunque el catálogo de permisos del módulo
  también ofrece `crear` y `eliminar` como opciones seleccionables por separado, en este módulo
  ninguna de las dos desbloquea escritura por sí sola — únicamente `editar` habilita registrar,
  editar y eliminar (las 3 acciones); otorgar solo `crear` o solo `eliminar` deja al operario sin
  ningún acceso de escritura real.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **No es inmutable**: a diferencia de Combustible y Mantenimiento, un servicio obligatorio ya
  registrado se puede editar o eliminar libremente por quien tenga permiso — es un registro
  administrativo de cumplimiento, no un movimiento financiero que requiera trazabilidad de
  cancelación. No existen otras tablas que dependan de un servicio obligatorio, por lo que
  eliminar uno nunca queda bloqueado por dependientes.
- **Tipo de servicio es un catálogo fijo, no personalizable por empresa**: los 3 valores
  (revisión físico-mecánica, verificación ambiental, renovación de aditamentos) son categorías
  legales iguales para todas las empresas — a diferencia de tipos de vehículo o productos, no se
  dan de alta ni se editan por tenant.
- **Comprobante opcional en dos pasos, sin historial de versiones**: el registro se puede guardar
  sin comprobante adjunto; el archivo (certificado/comprobante en PDF o imagen) se puede adjuntar
  en el mismo flujo o después — mismo flujo en dos pasos que las facturas de
  Combustible/Mantenimiento y la póliza de Vehículos, pero **sin** su historial de versiones: solo
  existe un comprobante vigente por servicio; adjuntar uno nuevo reemplaza y elimina el anterior
  (no hay versiones previas navegables). Esto es intencional, no una limitación pendiente: cada
  fila de `servicios_obligatorios` ya es, por diseño, un evento puntual — una renovación nueva es
  un registro nuevo (ver Edge Cases), no una versión sobre el mismo registro, a diferencia de la
  póliza de un vehículo, que sí se renueva sobre la misma fila.
- **Validaciones de fecha**: la fecha en que se realizó el servicio no puede ser futura (no se
  puede registrar un servicio que aún no ha ocurrido), y la fecha de vencimiento debe ser
  posterior a la fecha en que se realizó (la vigencia no puede empezar antes de haberse hecho el
  servicio).
- **Selector de vehículo excluye dados de baja** — mismo criterio que Combustible, Mantenimiento
  y Checklist.
- **Indicador visual de vigencia con el mismo umbral ya establecido en el proyecto**: vigente,
  por vencer (dentro de 60 días de la fecha de vencimiento) o vencido — mismo criterio ya usado
  para la vigencia de pólizas de vehículo (Feature 003).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar un servicio obligatorio (Priority: P1)

Como administrador (u operario con permiso `crear`), quiero registrar que un vehículo cumplió un
servicio obligatorio (revisión físico-mecánica, verificación ambiental, o renovación de
aditamentos), con su fecha de realización, su fecha de vencimiento, y opcionalmente el
comprobante, para dejar constancia del cumplimiento normativo de mi flotilla.

**Why this priority**: Es el núcleo de la feature — sin registro no hay bitácora que consultar ni
vigencias que dar seguimiento.

**Independent Test**: Registrar un servicio completo (vehículo, tipo, ambas fechas, comprobante
adjunto) y confirmar que queda visible en el listado con los datos correctos; intentar registrar
con fechas inválidas (a futuro, o vencimiento anterior a realización) y confirmar que se rechaza.

**Acceptance Scenarios**:

1. **Given** el formulario de registro, **When** el usuario selecciona un vehículo activo, un
   tipo de servicio, una fecha de realización no futura, y una fecha de vencimiento posterior a
   esa fecha, **Then** el servicio se registra y queda visible en el listado.
2. **Given** el formulario de registro, **When** el usuario intenta capturar una fecha de
   realización futura, **Then** el sistema lo rechaza con un mensaje claro antes de guardar.
3. **Given** el formulario de registro, **When** el usuario intenta capturar una fecha de
   vencimiento igual o anterior a la fecha de realización, **Then** el sistema lo rechaza con un
   mensaje claro antes de guardar.
4. **Given** un servicio recién registrado, **When** el usuario adjunta el comprobante (en el
   mismo flujo o después), **Then** queda disponible para ver y descargar desde el detalle del
   servicio.
5. **Given** el selector de vehículo, **When** se despliega, **Then** no incluye vehículos dados
   de baja.

---

### User Story 2 - Listado y búsqueda de servicios obligatorios (Priority: P1)

Como administrador u operario con permiso `ver`, quiero consultar el historial de servicios
obligatorios de mi flotilla, filtrando por vehículo, tipo, o rango de fechas, y ver de un vistazo
cuáles están vigentes, por vencer o vencidos, para priorizar cuáles necesitan atención antes de
generar una sanción.

**Why this priority**: Es la razón de negocio de la feature — prevenir sanciones requiere poder
identificar rápidamente qué está por vencer o ya venció; sin esto, registrar servicios no aporta
valor de seguimiento.

**Independent Test**: Con varios servicios ya registrados (vigentes, por vencer, y vencidos, de
distintos vehículos y tipos), aplicar cada filtro por separado y confirmar que el listado muestra
exactamente los registros esperados, cada uno con su indicador de vigencia correcto.

**Acceptance Scenarios**:

1. **Given** el listado de servicios obligatorios, **When** se filtra por vehículo, por tipo de
   servicio, o por rango de fechas, **Then** se muestran únicamente los registros que cumplen ese
   filtro.
2. **Given** un servicio cuya fecha de vencimiento ya pasó, **When** aparece en el listado,
   **Then** se marca visualmente como "vencido".
3. **Given** un servicio cuya fecha de vencimiento está dentro de los próximos 60 días, **When**
   aparece en el listado, **Then** se marca visualmente como "por vencer".
4. **Given** un servicio cuya fecha de vencimiento está a más de 60 días, **When** aparece en el
   listado, **Then** se marca visualmente como "vigente".

---

### User Story 3 - Editar y eliminar un servicio obligatorio (Priority: P2)

Como administrador (u operario con permiso `editar`/`eliminar`), quiero corregir o eliminar un
servicio obligatorio ya registrado, para poder arreglar errores de captura sin dejar registros
incorrectos en la bitácora.

**Why this priority**: Es un flujo de corrección — necesario para mantener la bitácora confiable,
pero la feature ya entrega su valor principal (registro y seguimiento de vigencias) sin él; es P2
porque depende de que ya existan servicios registrados (US-10.1).

**Independent Test**: Editar los datos de un servicio ya registrado (incluidas sus fechas) y
confirmar que los cambios se reflejan de inmediato; eliminar un servicio y confirmar que
desaparece del listado sin ningún bloqueo.

**Acceptance Scenarios**:

1. **Given** un servicio ya registrado, **When** el usuario edita cualquiera de sus campos
   (vehículo, tipo, fechas, comprobante), **Then** los cambios se guardan y se reflejan de
   inmediato en el listado y el detalle.
2. **Given** la edición de fechas de un servicio existente, **When** el usuario intenta guardar
   una combinación inválida (realización futura, o vencimiento no posterior a la realización),
   **Then** el sistema lo rechaza con un mensaje claro, igual que en el registro (US-10.1).
3. **Given** un servicio ya registrado, **When** el usuario lo elimina, **Then** desaparece del
   listado de inmediato, sin ningún mensaje de bloqueo por dependientes.

---

### Edge Cases

- ¿Qué pasa si se elimina un servicio que tiene un comprobante adjunto? El comprobante se elimina
  junto con el registro — mismo criterio de limpieza ya usado en Vehículos/Conductores para
  archivos sin otro dueño.
- ¿Qué pasa si se edita solo la fecha de vencimiento de un servicio, sin tocar la fecha de
  realización? Se revalida la misma regla (vencimiento posterior a realización) contra la fecha
  de realización ya guardada.
- ¿Qué pasa si dos servicios del mismo tipo se registran para el mismo vehículo (ej. dos
  verificaciones ambientales en fechas distintas)? Se permite — cada renovación es un registro
  independiente; el listado y sus filtros permiten distinguirlos por fecha.
- ¿Qué pasa si la fecha de realización es exactamente hoy? Se permite — la restricción es "no
  futura", no "anterior a hoy".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir al administrador (u operario con permiso `crear`)
  registrar un servicio obligatorio para un vehículo activo, seleccionando su tipo de un catálogo
  fijo de 3 valores (revisión físico-mecánica, verificación ambiental, renovación de
  aditamentos), su fecha de realización, y su fecha de vencimiento.
- **FR-002**: El selector de vehículo MUST excluir los vehículos dados de baja.
- **FR-003**: El sistema MUST rechazar el registro o la edición de un servicio cuya fecha de
  realización sea posterior a hoy.
- **FR-004**: El sistema MUST rechazar el registro o la edición de un servicio cuya fecha de
  vencimiento no sea posterior a su fecha de realización.
- **FR-005**: El sistema MUST permitir adjuntar un comprobante/certificado (PDF o imagen) al
  registrar un servicio o después, sin que sea obligatorio para guardar el registro inicial.
- **FR-006**: El sistema MUST permitir al administrador (u operario con permiso `editar`) editar
  cualquier campo de un servicio ya registrado, incluidas ambas fechas, sujeto a las mismas
  validaciones que el registro (FR-003, FR-004).
- **FR-007**: El sistema MUST permitir al administrador (u operario con permiso `eliminar`)
  eliminar un servicio ya registrado en cualquier momento, sin ningún bloqueo por dependientes.
- **FR-008**: El sistema MUST permitir listar y filtrar servicios obligatorios por vehículo, tipo
  de servicio, y rango de fechas.
- **FR-009**: Cada servicio en el listado MUST mostrar un indicador visual de su vigencia:
  "vencido" si su fecha de vencimiento ya pasó, "por vencer" si vence dentro de los próximos 60
  días, o "vigente" en cualquier otro caso.
- **FR-010**: El detalle de un servicio MUST mostrar todos sus datos (vehículo, tipo, ambas
  fechas, su indicador de vigencia) y el comprobante adjunto, si existe.
- **FR-011**: Un operario sin el permiso `editar` MUST poder consultar el listado y el detalle
  (permiso `ver`, otorgado por defecto), pero MUST NOT ver disponibles las acciones de registro,
  edición ni eliminación — esto incluye al operario al que se le otorgó `crear` o `eliminar` por
  separado sin `editar` (Actores): ninguna de esas dos acciones habilita escritura por sí sola en
  este módulo, así que la UI MUST NOT mostrar las acciones de escritura en ese caso tampoco.

### Key Entities

- **Servicio obligatorio**: registro de cumplimiento normativo de un vehículo — vehículo, tipo
  (uno de los 3 valores fijos), fecha de realización, fecha de vencimiento, comprobante adjunto
  (opcional). Editable y eliminable libremente. Su vigencia (vigente/por vencer/vencido) se
  deriva de su fecha de vencimiento respecto a hoy, no se almacena.

## Fuera de Alcance

- Alertas automáticas de vencimiento (notificaciones proactivas al acercarse o pasar la fecha de
  vencimiento) — pertenecen a una futura feature de Alertas/Dashboard, que necesita esta feature
  ya con datos (constitución §4, misma excepción documentada ya para
  Vehículos/Conductores/Mantenimiento/Checklist).
- Personalización del catálogo de tipos de servicio por empresa — son categorías legales fijas,
  iguales para todas las empresas; no hay pantalla de administración de este catálogo.
- Reportes o tendencias de cumplimiento a través del tiempo — pertenecen a una futura feature de
  Reportes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los registros con datos válidos quedan visibles de inmediato en el
  listado y en su propio detalle, con los datos correctos.
- **SC-002**: El 100% de los intentos de registrar o editar un servicio con una fecha de
  realización futura, o una fecha de vencimiento no posterior a la de realización, se rechazan
  antes de guardar.
- **SC-003**: Un usuario puede identificar, sin abrir ningún detalle, cuáles servicios de su
  flotilla están vencidos o por vencer con solo recorrer visualmente el listado.
- **SC-004**: Un usuario puede localizar un servicio específico combinando los filtros
  disponibles (vehículo, tipo, rango de fechas), sin tener que recorrer el listado completo.
- **SC-005**: El 100% de las eliminaciones de un servicio proceden sin ningún mensaje de bloqueo,
  y su comprobante adjunto (si existía) queda eliminado junto con el registro.

## Assumptions

- **Depende de `schema_12_tipo_archivo_testigo.sql`, aún sin aplicar**: agrega el valor
  `testigo_servicio` al enum `tipo_archivo` — esta feature MUST tratar esa migración como
  prerrequisito de Foundational. La tabla `servicios_obligatorios` y el tipo
  `tipo_servicio_obligatorio` (con sus 3 valores) ya existen en el esquema base
  (`schema.sql`), sin cambios de alcance.
- **Corrección**: una revisión inicial de este documento asumió, mirando solo la definición
  original de `servicios_obligatorios_write` en `schema.sql` ("14. Bitácora de servicios
  obligatorios"), que el modelo de permisos granular de esta especificación no estaba soportado.
  Eso era incorrecto: `schema_02_permisos.sql` (§5, ya aplicado vía la migración
  `20260806044220_modulos_y_permisos.sql`) reemplaza esa política por el patrón `tiene_permiso()`
  estándar, y `schema_03_ver_y_defaults.sql` (ya aplicado vía
  `20260806044221_permisos_ver_y_defaults.sql`) hace lo mismo para `SELECT` y siembra los
  permisos por defecto de un operario nuevo — el módulo `servicios_obligatorios` ya existe en
  `modulos`/`acciones_disponibles` (`ver`/`crear`/`editar`/`eliminar`), y el trigger
  `private.otorgar_permisos_default_operario()` ya incluye `servicios_obligatorios` en
  `modulos_ver` pero no en `modulos_crear` — exactamente el modelo de actores descrito arriba
  (operario con `ver` por defecto, `crear`/`editar`/`eliminar` solo por otorgamiento explícito).
  No se requiere ninguna migración de permisos/RLS para esta feature, a diferencia de lo que
  Checklist (009) sí tuvo que hacer en `schema_11`.
- **Umbral de "por vencer" de 60 días**: se reutiliza el mismo umbral ya usado para la vigencia de
  pólizas de vehículo (Feature 003, `UMBRAL_POR_VENCER_DIAS`), no un valor nuevo definido por
  esta feature.
- **Comprobante en el mismo bucket que otros archivos**: el comprobante de un servicio obligatorio
  usa el mismo bucket de almacenamiento (`documentos`) y el mismo patrón de carga en dos pasos ya
  usado por pólizas, facturas de combustible y facturas de mantenimiento.
