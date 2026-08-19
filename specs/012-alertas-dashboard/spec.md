# Feature Specification: Alertas y Dashboard

**Feature Branch**: `012-alertas-dashboard`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Feature 012 — Alertas y Dashboard: job diario que detecta
vencimientos próximos (licencias, pólizas, permisos, servicios obligatorios) y checklists con
observaciones sin atender, genera alertas in-app y envía un correo una sola vez por alerta.
Dashboard principal con KPIs y gráficas."

## Resumen

Cierra el ciclo de cumplimiento normativo de la flotilla: un job diario detecta automáticamente
qué está por vencer (licencias de conductor, pólizas de vehículo, permisos asignados a vehículo,
servicios obligatorios) y qué checklists quedaron con observaciones, genera una alerta por cada
condición nueva, notifica una sola vez por correo a los administradores, y las mantiene visibles
en un panel in-app hasta que se resuelvan (automáticamente, si la condición deja de aplicar, o
manualmente). Un dashboard principal resume el estado general de la flotilla con KPIs y gráficas,
reemplazando la pantalla de bienvenida genérica actual.

## Actores

- **El job diario**: corre con `service_role` (sin RLS), cruza todos los tenants en una sola
  corrida — no es un actor humano, pero es quien genera y resuelve alertas automáticamente.
- **Administrador**: ve y resuelve alertas de su empresa (permiso `aprobar` del módulo `alertas`,
  parte del acceso completo por rol); recibe el correo de notificación.
- **Operario**: tiene el permiso `ver` en el módulo `alertas` otorgado por defecto — puede
  consultar el panel de alertas y el dashboard, con los datos que sus propios permisos por módulo
  le dejen ver (ej. si no tiene `checklist.ver`, no ve datos de checklists en el dashboard). NO
  recibe el correo de notificación (exclusivo de administradores), y NO puede resolver alertas
  manualmente sin el permiso `aprobar`, que no se otorga por defecto.

## Clarifications

### Session 2026-08-11

- Q: El KPI "checklists con observaciones sin atender" del dashboard (US-12.3), ¿cuenta alertas
  abiertas de cualquier antigüedad, o solo de los últimos N días (para no acumular
  indefinidamente si nunca se resuelven)? → A: Últimos 30 días — misma ventana ya usada en el
  resto del dashboard (licencias/pólizas por vencer, indicador de cumplimiento de checklists),
  da consistencia interna y evita que el KPI crezca sin límite si el equipo no resuelve las
  alertas viejas.
- Q: La gráfica de pastel de "montos invertidos en mantenimiento, correctivo vs. preventivo"
  (US-12.3) decía "del período" sin definir cuál, a diferencia de las otras 2 gráficas de pastel
  del dashboard, que sí especifican "mes en curso" — ¿qué ventana de tiempo debe usar? → A:
  Últimos 30 días — ventana móvil, distinta de la de las otras 2 gráficas (que sí usan mes en
  curso); consistente con el lenguaje de "30 días" ya usado en los KPIs de vencimiento.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Ventana única de 30 días** para "por vencer" — igual para licencias, pólizas, permisos y
  servicios obligatorios; no configurable por empresa en esta feature.
- **Checklists incompletos = `resultado='con_observaciones'` sin atender**: "atender" significa
  resolver la alerta correspondiente (marcarla como resuelta), **no** editar el checklist en sí
  (que sigue siendo completamente inmutable, Feature 009) — la alerta es la que lleva el estado
  de seguimiento, el checklist mismo nunca cambia.
- **El correo se envía una sola vez por alerta**, en el momento en que se crea — no hay
  recordatorios periódicos mientras la alerta siga abierta. El panel in-app es la fuente de
  seguimiento continuo, no el correo.
- **Destinatarios del correo**: únicamente administradores activos de la empresa afectada — los
  operarios no reciben correo, aunque puedan ver la alerta in-app si tienen el permiso.
- **Auto-resolución**: si la condición que generó una alerta deja de cumplirse antes de que un
  humano la cierre manualmente (ej. se renovó la póliza fuera de la ventana de 30 días, el
  vehículo se dio de baja, el checklist tiene ahora un checklist posterior con resultado
  aprobado — ver Edge Cases), el job la marca resuelta automáticamente en su siguiente corrida.
- **Sin alertas duplicadas**: mientras una alerta para una entidad+tipo específico siga abierta
  (pendiente o enviada), el job no MUST crear una segunda para la misma condición.
- **El dashboard reemplaza la pantalla de bienvenida genérica actual**, tanto para administrador
  como para operario — no es una pantalla nueva en una ruta aparte, es el contenido de la página
  de inicio que cada uno ya ve al iniciar sesión.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Detección diaria de vencimientos y notificación (Priority: P1)

Como sistema, quiero escanear diariamente, en todas las empresas, qué licencias, pólizas,
permisos y servicios obligatorios están por vencer, y qué checklists quedaron con observaciones,
para generar una alerta por cada condición nueva y notificar a los administradores por correo,
sin que nadie tenga que revisar manualmente cada módulo por separado.

**Why this priority**: Es el motor de toda la feature — sin detección automática, no hay ni
panel de alertas ni datos que mostrar en el dashboard.

**Independent Test**: Con datos de prueba que incluyan al menos una licencia, una póliza, un
permiso, y un servicio obligatorio dentro de los próximos 30 días, y un checklist con
observaciones, ejecutar el job y confirmar que se crea exactamente una alerta por cada condición,
con su correo correspondiente enviado a los administradores de esa empresa; correr el job de
nuevo sin cambios y confirmar que no se duplican; hacer que una condición deje de aplicar y
confirmar que su alerta se marca resuelta en la siguiente corrida.

**Acceptance Scenarios**:

1. **Given** un conductor activo con licencia por vencer dentro de 30 días, sin alerta abierta
   para esa licencia, **When** corre el job, **Then** se crea una alerta tipo `licencia` en
   estado `pendiente`, se envía un correo a los administradores activos de esa empresa, y la
   alerta pasa a `enviada`.
2. **Given** las mismas condiciones para un vehículo con póliza por vencer, un permiso de
   vehículo por vencer, o un servicio obligatorio por vencer, **When** corre el job, **Then** se
   comporta igual que el escenario 1, con el tipo de alerta correspondiente
   (`poliza`/`permiso`/`servicio_obligatorio`).
3. **Given** un checklist con `resultado='con_observaciones'` sin ninguna alerta abierta para él,
   **When** corre el job, **Then** se crea una alerta tipo `checklist` (sin fecha de
   vencimiento), se notifica, y pasa a `enviada`.
4. **Given** una alerta ya abierta (pendiente o enviada) para una entidad y tipo específicos,
   **When** corre el job de nuevo y la misma condición sigue vigente, **Then** NO se crea una
   segunda alerta para esa misma entidad+tipo.
5. **Given** una alerta abierta cuya condición ya no aplica (ej. la póliza se renovó fuera de la
   ventana de 30 días, o el vehículo se dio de baja), **When** corre el job, **Then** la alerta se
   marca `resuelta` automáticamente, sin intervención humana.
6. **Given** una empresa sin ningún administrador activo, **When** corre el job y detecta una
   condición nueva en esa empresa, **Then** la alerta se crea igual (queda visible in-app para
   quien la vea después), pero no hay ningún destinatario al que enviar correo.

---

### User Story 2 - Panel de alertas in-app (Priority: P1)

Como administrador u operario con permiso `ver` en alertas, quiero ver un contador de alertas
abiertas en la barra superior y una pantalla dedicada con filtros, para dar seguimiento a qué
necesita atención sin depender de revisar mi correo.

**Why this priority**: Es la superficie de uso diario de la feature — el correo es una
notificación puntual, pero el seguimiento continuo (qué sigue pendiente, qué ya se resolvió)
sucede aquí.

**Independent Test**: Con varias alertas ya generadas (de distintos tipos y estados), confirmar
que el contador de la barra superior refleja el total de abiertas (pendiente + enviada);
aplicar cada filtro por separado y confirmar que el listado muestra exactamente las alertas
esperadas; resolver una manualmente y confirmar que desaparece del conteo de abiertas.

**Acceptance Scenarios**:

1. **Given** un usuario con permiso `ver` en alertas, **When** ve la barra superior en cualquier
   pantalla, **Then** un ícono de notificaciones muestra el número de alertas abiertas
   (pendiente + enviada) que ese usuario tiene permiso de ver.
2. **Given** la pantalla de alertas, **When** se filtra por tipo (licencia/póliza/permiso/
   servicio obligatorio/checklist) o por estado, **Then** se muestran únicamente las alertas que
   cumplen ese filtro.
3. **Given** una alerta abierta, **When** un administrador (u operario con permiso `aprobar`) usa
   la acción "Marcar como resuelta", **Then** la alerta pasa a `resuelta` de inmediato, sin
   esperar a la siguiente corrida del job, y el contador de la barra superior se actualiza.
4. **Given** una alerta abierta, **When** un operario sin el permiso `aprobar` (permiso por
   defecto, solo `ver`) consulta la pantalla de alertas, **Then** puede verla pero no tiene
   disponible la acción de resolverla.
5. **Given** una alerta ya resuelta (por el job o manualmente), **When** aparece en el listado
   con el filtro de estado correspondiente, **Then** no cuenta en el ícono de notificaciones de
   la barra superior.

---

### User Story 3 - Dashboard principal (Priority: P2)

Como administrador u operario, quiero ver, al iniciar sesión, un resumen del estado general de mi
flotilla — vehículos activos, qué está por vencer, cómo se está gastando en mantenimiento, y qué
tan bien se están cumpliendo los checklists — para tener una vista general sin tener que entrar a
cada módulo por separado.

**Why this priority**: Aporta valor de vista general, pero depende de que ya existan datos
operativos de las demás features (y de US-12.1/US-12.2 para los KPIs de vencimientos) — es
consumo de datos ya generados, no una capacidad nueva de captura.

**Independent Test**: Con datos de prueba que cubran vehículos activos, licencias/pólizas por
vencer, mantenimientos de ambos tipos, y checklists con ambos resultados, abrir el dashboard y
confirmar que cada KPI y cada gráfica refleja los números esperados.

**Acceptance Scenarios**:

1. **Given** el dashboard, **When** se carga, **Then** muestra 4 tarjetas de KPI: vehículos
   activos, licencias por vencer (30 días), pólizas por vencer (30 días), y checklists con
   observaciones sin atender en los últimos 30 días (Clarifications sesión 2026-08-11).
2. **Given** el dashboard, **When** se carga, **Then** muestra una gráfica de pastel de montos de
   mantenimiento de los últimos 30 días agrupados por tipo (correctivo/preventivo, solo
   registros activos — Clarifications sesión 2026-08-11).
3. **Given** el dashboard, **When** se carga, **Then** muestra una gráfica de pastel de licencias
   por vencer en el mes en curso, y otra de pólizas por vencer en el mes en curso.
4. **Given** el dashboard, **When** se carga, **Then** muestra un indicador de cumplimiento de
   checklists por tipo de vehículo: % aprobado vs. % con observaciones de los últimos 30 días.
5. **Given** un operario sin permiso `ver` en uno de los módulos de origen de un KPI o gráfica
   (ej. sin `checklist.ver`), **When** ve el dashboard, **Then** esa sección en particular
   muestra un valor vacío/cero, sin generar ningún error que rompa el resto del dashboard.

---

### Edge Cases

- ¿Qué pasa si un checklist con observaciones tiene, después, un checklist *posterior* del mismo
  vehículo con resultado aprobado? La alerta del checklist con observaciones sigue abierta — un
  checklist nuevo no resuelve retroactivamente la alerta de uno anterior; solo se resuelve
  manualmente (US-12.2) o si el propio registro de origen deja de existir (no aplica a
  checklists, que no se eliminan, Feature 009).
- ¿Qué pasa si una entidad con alerta abierta (ej. un conductor con licencia por vencer) se
  desactiva o se elimina antes de que la alerta se resuelva? Cuenta como "la condición ya no
  aplica" — el job la marca resuelta en su siguiente corrida (mismo criterio que dar de baja un
  vehículo).
- ¿Qué pasa si el envío de correo falla (ej. SMTP caído) pero la alerta ya se insertó? La alerta
  MUST quedar visible in-app en estado `pendiente` de todas formas — un fallo de correo no MUST
  impedir que la alerta exista ni bloquear la corrida del resto del job para las demás
  condiciones/empresas.
- ¿Qué pasa si el job corre más de una vez el mismo día (ej. reintento manual)? El índice único
  parcial sobre alertas abiertas (empresa+tipo+entidad) evita duplicados — la segunda corrida no
  crea nada nuevo para condiciones ya alertadas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST ejecutar, una vez al día, un proceso que escanee — sin filtrar por
  empresa — conductores activos con licencia por vencer en 30 días, vehículos activos con póliza
  por vencer en 30 días, permisos de vehículo por vencer en 30 días, y servicios obligatorios por
  vencer en 30 días.
- **FR-002**: El sistema MUST detectar, en la misma corrida, checklists con
  `resultado='con_observaciones'` que no tengan ya una alerta abierta.
- **FR-003**: Por cada condición detectada sin una alerta abierta previa para esa misma
  entidad+tipo, el sistema MUST crear una alerta en estado `pendiente`.
- **FR-004**: El sistema MUST NOT crear una segunda alerta abierta para la misma entidad+tipo
  mientras la anterior siga sin resolverse.
- **FR-005**: Al crear una alerta nueva, el sistema MUST enviar un correo a los administradores
  activos de la empresa correspondiente, y MUST actualizar la alerta a `enviada` tras el envío.
  Un fallo de envío MUST NOT impedir que la alerta quede creada y visible in-app.
- **FR-006**: El sistema MUST marcar como `resuelta` cualquier alerta abierta cuya condición de
  origen ya no aplique al momento de la corrida.
- **FR-007**: El sistema MUST mostrar, en la barra superior de la aplicación, un contador de
  alertas abiertas (pendiente + enviada) visibles según el permiso `ver` del módulo `alertas` del
  usuario actual.
- **FR-008**: El sistema MUST proveer una pantalla de alertas con filtros por tipo (licencia/
  póliza/permiso/servicio obligatorio/checklist) y por estado.
- **FR-009**: El sistema MUST permitir a un usuario con el permiso `aprobar` del módulo `alertas`
  marcar manualmente una alerta como resuelta, sin esperar a la siguiente corrida del job.
- **FR-010**: Un usuario con `ver` pero sin `aprobar` MUST poder consultar las alertas pero MUST
  NOT tener disponible la acción de resolverlas.
- **FR-011**: El sistema MUST reemplazar la pantalla de inicio actual (tanto de administrador
  como de operario) por un dashboard con: 4 KPIs (vehículos activos, licencias por vencer en 30
  días, pólizas por vencer en 30 días, checklists con observaciones sin atender en los últimos 30
  días), una gráfica de montos de mantenimiento de los últimos 30 días agrupados por tipo, dos
  gráficas de vencimientos del mes en curso (licencias, pólizas), y un indicador de cumplimiento
  de checklists por tipo de vehículo de los últimos 30 días (Clarifications sesión 2026-08-11).
- **FR-012**: Cada sección del dashboard MUST reflejar únicamente los datos que el permiso `ver`
  del módulo correspondiente le permite ver al usuario actual — sin permiso sobre un módulo de
  origen, esa sección MUST mostrarse vacía o en cero, sin generar un error que afecte al resto
  del dashboard.

### Key Entities

- **Alerta**: ya existe (`public.alertas`) — empresa, tipo (licencia/poliza/permiso/
  servicio_obligatorio/checklist), entidad de origen (tabla + id), fecha de vencimiento (opcional
  — los checklists no tienen una), estado (pendiente/enviada/resuelta).
- **Condición de vencimiento**: no es una entidad nueva — se deriva en el momento de la corrida
  del job a partir de las fechas de vencimiento ya existentes en Conductores, Vehículos, Permisos
  de Vehículo, y Servicios Obligatorios, más el resultado de Checklists.

## Fuera de Alcance

- Configurar la ventana de 30 días por empresa — queda fija por ahora; se puede volver
  configurable si algún cliente lo pide.
- Notificaciones push o por WhatsApp — solo correo e in-app.
- Alertas de "próximo mantenimiento" basadas en `mantenimientos.servicio_fecha_proximo`/
  `servicio_frecuencia_km` — Mantenimiento (008) dejó esas columnas listas explícitamente
  anticipando esta feature, pero el alcance actual de Alertas (definido en este brief) no las
  incluye entre sus 5 fuentes de detección. Se documenta aquí para que la omisión sea rastreable,
  no un olvido silencioso — se puede agregar como una sexta fuente en una iteración futura si se
  decide.
- Recordatorios periódicos por correo mientras una alerta siga abierta — el correo se envía una
  sola vez (ver Decisiones).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las condiciones de vencimiento dentro de la ventana de 30 días (en
  cualquiera de las 4 fuentes con fecha) generan exactamente una alerta, sin duplicados, dentro
  de la misma corrida en que se detectan por primera vez.
- **SC-002**: El 100% de las alertas nuevas generan un intento de envío de correo a los
  administradores activos de su empresa, sin bloquear la detección de otras condiciones si el
  envío falla.
- **SC-003**: El 100% de las alertas cuya condición de origen deja de aplicar quedan marcadas
  `resuelta` a más tardar en la siguiente corrida diaria del job.
- **SC-004**: Un usuario puede identificar cuántas alertas requieren su atención sin abrir la
  pantalla de alertas, con solo ver la barra superior.
- **SC-005**: Un administrador puede localizar una alerta específica combinando los filtros
  disponibles (tipo, estado), sin recorrer el listado completo.
- **SC-006**: Los 4 KPIs y las 3 gráficas del dashboard reflejan datos correctos verificables
  contra los módulos de origen, sin necesidad de que el usuario visite cada módulo por separado.

## Assumptions

- **Ya existe infraestructura de correo reutilizable**: `server/utils/mailer.ts` (Nodemailer
  sobre SMTP, ya usado por la invitación de operarios, Feature 001) provee `sendMail()` y una
  plantilla HTML de marca (`renderEmailLayout()`) ya alineada con `docs/design-system.md`. Esta
  feature reutiliza ese mismo mecanismo/branding para el correo de alerta — no se documenta como
  una decisión nueva de "cómo enviar correo", solo su contenido específico. Cómo exactamente el
  proceso diario (que corre fuera del servidor Nitro, ver siguiente punto) invoca esa utilidad
  **es una decisión de `/speckit-plan`**, no de esta especificación.
- **Primera Edge Function + `pg_cron` del proyecto**: hasta esta feature, todo el acceso a datos
  del proyecto pasa por `useSupabaseClient()` desde el cliente o composables — no existe
  `supabase/functions/` todavía, ni ningún uso previo de `pg_cron`. El job diario descrito en
  US-12.1 corre en un runtime distinto al servidor Nitro de la aplicación (Deno, vía Supabase
  Edge Functions) — el diseño exacto (cómo se agenda, cómo autentica, cómo reutiliza o
  reimplementa el envío de correo) es responsabilidad de `/speckit-plan`, esta especificación
  solo define el comportamiento observable (qué detecta, qué crea, a quién notifica).
- **No existe todavía ninguna librería de gráficas** en el proyecto — Vuetify no incluye
  componentes de gráficas nativos. Esta feature requiere agregar una dependencia nueva para las
  3 gráficas de pastel de US-12.3; la elección específica de librería es una decisión de
  `/speckit-plan`, no de esta especificación.
- **El dashboard reemplaza contenido ya existente, no crea rutas nuevas**: tanto
  `app/pages/admin/index.vue` como `app/pages/operario/index.vue` ya existen como pantallas de
  bienvenida genéricas (Feature 001) — esta feature reemplaza su contenido por el dashboard
  descrito en US-12.3, reutilizando las mismas rutas y layouts ya establecidos.
- **El modelo de permisos del módulo `alertas` ya está completo**: a diferencia de hallazgos
  similares en features anteriores (010, 011), aquí no hay ninguna corrección de esquema
  pendiente — `alertas_select` ya usa `tiene_permiso('alertas','ver')` (otorgado por defecto a
  todo operario nuevo) y `alertas_update` ya usa `tiene_permiso('alertas','aprobar')` (no
  otorgado por defecto), ambos desde la migración inicial de permisos del proyecto. Solo falta
  aplicar `schema_14_alertas_ajustes.sql` (columna `fecha_vencimiento` de `alertas` pasa a
  opcional, e índice único parcial anti-duplicados) — ya escrito, sin cambios de alcance
  necesarios.
