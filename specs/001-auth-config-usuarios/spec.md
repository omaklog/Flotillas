# Feature Specification: Autenticación, Configuración Inicial, Usuarios y Permisos

**Feature Branch**: `001-auth-config-usuarios`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Feature 001 — Autenticación, Configuración Inicial, Usuarios y Permisos. Permite: (a) que el superusuario dé de alta nuevas empresas (tenants) junto con su primer administrador; (b) que cada empresa complete su configuración inicial; (c) que cualquier usuario inicie sesión de forma segura; (d) que el administrador gestione las cuentas de sus operarios y les otorgue permisos granulares por módulo/acción. Primera feature a implementar: todo lo demás depende de que exista login, una empresa configurada y el sistema de roles/permisos funcionando."

## Resumen

Esta feature es la base de todo el sistema: sin ella no existe forma de entrar a la aplicación,
de dar de alta una empresa cliente (tenant), ni de administrar quién puede hacer qué dentro de
cada empresa. Cubre el ciclo completo de identidad y acceso — desde que el superusuario crea una
empresa nueva, hasta que un operario recibe permisos granulares para operar en un módulo
específico.

## Actores

- **Superusuario**: da de alta empresas y sus administradores. No pertenece a ninguna empresa.
  Tiene pantallas propias dentro de la aplicación (no se gestiona vía Supabase Studio), pensando
  en incorporar más empresas cliente a futuro.
- **Administrador**: gestiona la configuración de su propia empresa y las cuentas de sus
  operarios.
- **Operario**: inicia sesión, recupera su contraseña y ve su propio perfil; opera dentro de los
  módulos para los que tiene permisos otorgados.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas con el negocio y no están abiertas a `/speckit-clarify`;
se documentan aquí porque condicionan el alcance y los criterios de aceptación de las historias
de usuario:

- **Alta de usuarios por invitación**: toda alta de usuario (operario, y también el primer
  administrador de una empresa nueva) se hace por invitación por correo. El sistema crea la
  cuenta en estado "invitado"; el usuario establece su propia contraseña al primer acceso. Nadie
  más que el propio usuario conoce su contraseña.
- **Login**: correo electrónico + contraseña (no hay username independiente).
- **Unidades históricas**: cambiar la unidad de distancia o de combustible de una empresa no
  convierte retroactivamente los registros ya capturados; cada registro conserva la unidad con la
  que se capturó, y los reportes muestran esa unidad junto al dato histórico.
- **Correo saliente**: dos mecanismos, un solo proveedor SMTP detrás de ambos.
  - Correos nativos de recuperación de contraseña y confirmación de cambio de correo se envían
    vía un proveedor SMTP propio configurado por el operador del sistema (el mecanismo por
    defecto de la plataforma de autenticación no es apto para producción: limita volumen y
    destinatarios).
  - Invitaciones (empresa nueva, administrador adicional, operario) y notificaciones propias
    (empresa desactivada, alertas de vencimiento) se generan con una plantilla propia que sigue
    el sistema de diseño del proyecto, usando el mismo proveedor SMTP.
- **Notificación de desactivación**: al desactivar una empresa, se notifica por correo a todos
  sus administradores explicando la desactivación.
- **Expiración de sesión**: se usa la política estándar de expiración/renovación de sesión para
  los tres roles, incluido el superusuario; no se ajusta por ahora.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Superusuario da de alta una nueva empresa (Priority: P1)

Como superusuario, quiero crear una nueva empresa junto con su primer administrador, para poder
incorporar un nuevo cliente al sistema.

**Why this priority**: Es la raíz de todo lo demás — sin al menos una empresa y un administrador,
no hay nada más que probar ni operar en el sistema.

**Independent Test**: Puede probarse por completo iniciando sesión como superusuario, llenando el
formulario de alta de empresa, y verificando que se crea la empresa, se crea el usuario
administrador asociado y se dispara la invitación por correo — sin depender de ninguna otra
historia.

**Acceptance Scenarios**:

1. **Given** que el superusuario tiene sesión iniciada, **When** completa el formulario de alta
   con los datos de la empresa (nombre, RFC, teléfonos, correo, país, moneda, unidad de
   distancia, unidad de combustible) y los datos del primer administrador (nombre, correo) y lo
   guarda, **Then** se crea la empresa, se crea el registro de usuario con rol `admin` asociado a
   esa empresa, y se envía una invitación por correo a esa persona.
2. **Given** que el formulario de alta de empresa no incluye un logo, **When** se guarda,
   **Then** la empresa se crea correctamente y el logo queda pendiente de cargarse después desde
   Configuración.

---

### User Story 2 - Inicio de sesión (Priority: P1)

Como usuario de cualquier rol, quiero iniciar sesión con mi correo y contraseña, para acceder a
las funciones que me correspondan.

**Why this priority**: Es el punto de entrada obligatorio para los tres roles; sin login no hay
producto utilizable.

**Independent Test**: Puede probarse de forma aislada con una cuenta ya activa (creada por
seed o por otra historia) intentando iniciar sesión con credenciales correctas e incorrectas y
verificando el comportamiento en ambos casos.

**Acceptance Scenarios**:

1. **Given** que un usuario activo introduce su correo, contraseña correctos y resuelve el
   captcha, **When** envía el formulario, **Then** el sistema lo redirige a la página principal
   correspondiente a su rol.
2. **Given** que un usuario introduce credenciales incorrectas, **When** envía el formulario,
   **Then** el sistema muestra "Usuario o Contraseña Incorrecta", permite reintentar, y no revela
   si el correo existe o no en el sistema.
3. **Given** que un usuario pertenece a una empresa desactivada, **When** intenta iniciar sesión
   con credenciales correctas, **Then** el sistema muestra un mensaje explícito de empresa
   desactivada, distinto al de credenciales incorrectas.
4. **Given** que el captcha no se resuelve, **When** el usuario intenta enviar el formulario,
   **Then** el sistema bloquea el envío hasta que el captcha se resuelva correctamente.

---

### User Story 3 - Recuperar contraseña (Priority: P2)

Como usuario que olvidó su contraseña, quiero solicitar un enlace de recuperación por correo,
para poder volver a acceder sin depender de soporte.

**Why this priority**: Es una vía de acceso alterna necesaria, pero el sistema ya entrega valor
core con login normal funcionando; la recuperación es la red de seguridad.

**Independent Test**: Puede probarse solicitando recuperación con un correo existente y con uno
inexistente, y verificando que la respuesta visible al usuario es idéntica en ambos casos.

**Acceptance Scenarios**:

1. **Given** que un usuario solicita recuperar su contraseña con su correo registrado, **When**
   envía la solicitud, **Then** recibe un enlace de un solo uso con expiración corta.
2. **Given** que alguien solicita recuperación con un correo que no existe en el sistema, **When**
   envía la solicitud, **Then** el sistema muestra el mismo mensaje de confirmación que si el
   correo existiera.

---

### User Story 4 - Configuración inicial de la empresa (Priority: P2)

Como administrador, quiero completar y editar la configuración de mi empresa, para que el
sistema opere con los datos correctos de mi organización.

**Why this priority**: Necesaria para que el resto de los módulos (fuera de esta feature) operen
con las unidades y datos correctos, pero la empresa ya queda operativa con los valores mínimos
capturados en el alta (User Story 1).

**Independent Test**: Puede probarse iniciando sesión como administrador de una empresa ya
existente y editando cada campo de configuración de forma aislada.

**Acceptance Scenarios**:

1. **Given** que el administrador abre la pantalla de Configuración, **When** edita nombre, RFC,
   teléfonos, logo, correo, unidad de distancia, unidad de combustible, país o moneda y guarda,
   **Then** los cambios se reflejan de inmediato en la empresa.
2. **Given** que la empresa ya tiene registros de combustible o distancia capturados, **When** el
   administrador cambia la unidad de distancia o de combustible, **Then** los registros ya
   capturados conservan la unidad original y los reportes la muestran junto al dato histórico.

---

### User Story 5 - Administrador invita a un operario (Priority: P2)

Como administrador, quiero invitar operarios a mi empresa, para que puedan empezar a operar en
los módulos correspondientes.

**Why this priority**: Sin esto la empresa queda limitada a un solo usuario (el administrador);
es la vía de crecimiento del equipo.

**Independent Test**: Puede probarse invitando un operario con nombre y correo, y verificando que
queda en estado "Pendiente" con los permisos mínimos por defecto ya otorgados.

**Acceptance Scenarios**:

1. **Given** que el administrador completa el formulario de invitación (nombre, correo) y lo
   guarda, **When** se procesa la invitación, **Then** se crea el usuario en estado "invitado"
   con rol `operario`, se le otorgan automáticamente los permisos mínimos por defecto (ver en
   todos los módulos operativos excepto Usuarios y Configuración; crear en combustible/
   mantenimiento/checklist/archivos), y se dispara el envío de la invitación por correo.
2. **Given** que un operario invitado no ha aceptado su invitación, **When** el administrador
   consulta el listado de usuarios, **Then** ese operario aparece con estado "Pendiente".

---

### User Story 6 - Administrador asigna permisos granulares a un operario (Priority: P2)

Como administrador, quiero controlar exactamente qué puede hacer cada operario en cada módulo,
para mantener el control de acceso alineado con las responsabilidades reales de cada persona.

**Why this priority**: Es el corazón del modelo de autorización granular exigido por el proyecto;
sin esta pantalla el sistema de permisos por defecto no se puede ajustar a la realidad de cada
empresa.

**Independent Test**: Puede probarse abriendo la pantalla de permisos de un operario existente,
otorgando y quitando acciones específicas por módulo, y verificando el efecto inmediato sobre lo
que ese operario puede hacer.

**Acceptance Scenarios**:

1. **Given** que el administrador abre la pantalla de permisos de un operario, **When** visualiza
   los 16 módulos del sistema, **Then** ve, por módulo, los permisos de "ver" y "crear" ya
   premarcados según los valores por defecto, y los de "editar" y "eliminar" sin premarcar.
2. **Given** que el administrador otorga un permiso de "editar" a un módulo específico, **When**
   guarda el cambio, **Then** el operario puede realizar esa acción sin necesidad de cerrar e
   iniciar sesión de nuevo.
3. **Given** que el administrador quita un permiso de "ver" que venía por defecto, **When** guarda
   el cambio, **Then** el operario deja de poder acceder a ese módulo de inmediato.
4. **Given** que un módulo tiene acciones adicionales (cancelar, aprobar, exportar), **When** el
   administrador las otorga o las retira, **Then** el cambio aplica igual que con ver/crear/
   editar/eliminar.

---

### User Story 7 - Superusuario administra empresas existentes (Priority: P3)

Como superusuario, quiero ver, buscar y desactivar empresas existentes, para mantener el control
operativo de todos los tenants del sistema.

**Why this priority**: Es gestión continua, no bloquea el uso inicial del sistema por una empresa
ya dada de alta.

**Independent Test**: Puede probarse con al menos dos empresas ya existentes, buscándolas por
nombre/RFC y desactivando una de ellas.

**Acceptance Scenarios**:

1. **Given** que existen varias empresas, **When** el superusuario busca por nombre o por RFC,
   **Then** el listado se filtra correctamente.
2. **Given** que el superusuario abre el detalle de una empresa, **When** consulta su información,
   **Then** ve sus administradores activos y su fecha de alta.
3. **Given** que el superusuario desactiva una empresa, **When** la desactivación se confirma,
   **Then** la empresa y su historial se conservan, el login de todos sus usuarios queda
   bloqueado con un mensaje explícito, y se envía un correo a todos sus administradores
   explicando la desactivación.

---

### User Story 8 - Superusuario gestiona administradores de una empresa (Priority: P3)

Como superusuario, quiero invitar administradores adicionales a una empresa o revocar el acceso
de uno existente, para dar soporte operativo a los clientes ya dados de alta.

**Why this priority**: Es un caso de gestión secundario frente al alta inicial (User Story 1); la
empresa ya es operativa con un solo administrador.

**Independent Test**: Puede probarse sobre una empresa ya existente, invitando un segundo
administrador y luego revocando el acceso de uno de los dos.

**Acceptance Scenarios**:

1. **Given** que una empresa ya tiene un administrador, **When** el superusuario invita a un
   administrador adicional con nombre y correo, **Then** se crea el nuevo usuario en estado
   "invitado" con rol `admin` y se le envía la invitación.
2. **Given** que un administrador tiene acceso activo, **When** el superusuario revoca su acceso,
   **Then** ese administrador deja de poder iniciar sesión, pero su registro y su historial de
   auditoría se conservan.

---

### User Story 9 - Administrador gestiona operarios existentes (Priority: P3)

Como administrador, quiero ver el estado de mis operarios, desactivarlos, reenviarles su
invitación o eliminarlos cuando corresponda, para mantener ordenada la plantilla de mi empresa.

**Why this priority**: Es mantenimiento continuo sobre operarios ya invitados (User Story 5); no
bloquea el uso inicial del sistema.

**Independent Test**: Puede probarse con operarios en distintos estados (activo, pendiente) —
desactivando uno, reenviando invitación a otro, e intentando eliminar uno con y sin operaciones
registradas.

**Acceptance Scenarios**:

1. **Given** que el administrador consulta el listado de operarios, **When** busca por nombre,
   **Then** ve el resultado filtrado junto con el estado de cada operario (activo/pendiente/
   inactivo).
2. **Given** que un operario está activo, **When** el administrador lo desactiva, **Then** el
   operario deja de poder iniciar sesión y su historial se conserva.
3. **Given** que un operario sigue en estado "Pendiente", **When** el administrador reenvía la
   invitación, **Then** se genera y envía un nuevo enlace de invitación.
4. **Given** que un operario tiene operaciones registradas a su nombre (cargas de combustible,
   mantenimientos, checklists, servicios obligatorios), **When** el administrador intenta
   eliminarlo, **Then** el sistema impide la eliminación y ofrece desactivarlo en su lugar.
5. **Given** que un operario no tiene ninguna operación registrada a su nombre, **When** el
   administrador lo elimina, **Then** el registro se elimina definitivamente.

---

### User Story 10 - Cierre de sesión (Priority: P3)

Como usuario de cualquier rol, quiero poder cerrar mi sesión de forma explícita, para proteger mi
cuenta cuando termino de usar el sistema.

**Why this priority**: Es una acción simple y de bajo riesgo técnico; no bloquea ninguna otra
funcionalidad si se entrega al final.

**Independent Test**: Puede probarse iniciando sesión con cualquier rol y usando la opción de
cerrar sesión desde el menú de perfil.

**Acceptance Scenarios**:

1. **Given** que un usuario de cualquier rol tiene sesión iniciada, **When** selecciona "Cerrar
   sesión" desde el menú de perfil, **Then** su sesión termina y se le redirige a la pantalla de
   login.

---

### Edge Cases

- ¿Qué pasa si el superusuario intenta dar de alta una empresa con un RFC o un correo de
  administrador ya registrados en el sistema?
- ¿Qué pasa si un enlace de invitación o de recuperación de contraseña expira antes de que el
  usuario lo use?
- ¿Qué pasa con la sesión activa de un usuario cuya empresa es desactivada mientras la sesión
  sigue vigente?
- ¿Qué pasa si el superusuario intenta revocar al único administrador activo de una empresa?
- ¿Qué pasa si un operario invitado intenta iniciar sesión antes de aceptar su invitación y
  establecer contraseña?
- ¿Qué pasa si el envío del correo de invitación o notificación falla (proveedor de correo no
  disponible)?
- ¿Qué pasa si dos administradores editan los permisos del mismo operario al mismo tiempo?
- ¿Qué pasa si un administrador intenta eliminar a un operario justo cuando se le está
  registrando una operación en otro módulo?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir a un superusuario crear una nueva empresa capturando
  nombre, RFC, teléfonos, correo, país, moneda, unidad de distancia y unidad de combustible,
  junto con nombre y correo de su primer administrador, en un único flujo.
- **FR-002**: Al guardarse exitosamente el alta de una empresa, el sistema MUST crear
  automáticamente el usuario administrador asociado con rol `admin` y disparar el envío de una
  invitación por correo a esa persona.
- **FR-003**: El logo de la empresa MUST ser opcional durante el alta inicial y MUST poder
  completarse después desde Configuración.
- **FR-004**: El sistema MUST proveer al superusuario un listado de empresas con búsqueda por
  nombre y por RFC.
- **FR-005**: El sistema MUST mostrar, por cada empresa, sus administradores activos y su fecha
  de alta.
- **FR-006**: El superusuario MUST poder desactivar una empresa sin eliminar sus datos ni su
  historial.
- **FR-007**: Una empresa desactivada MUST bloquear el inicio de sesión de todos sus usuarios,
  mostrando un mensaje explícito de empresa desactivada, distinto al de credenciales inválidas.
- **FR-008**: Al desactivar una empresa, el sistema MUST notificar por correo a todos sus
  administradores activos.
- **FR-009**: El superusuario MUST poder invitar administradores adicionales a una empresa ya
  existente.
- **FR-010**: El superusuario MUST poder revocar el acceso de un administrador sin eliminar su
  registro ni su historial de auditoría; un administrador revocado NO MUST poder iniciar sesión.
- **FR-011**: El administrador MUST poder completar y editar la configuración de su empresa:
  nombre, RFC, teléfonos, logo, correo, unidad de distancia, unidad de combustible, país y
  moneda.
- **FR-012**: Cambiar la unidad de distancia o de combustible de una empresa NO MUST convertir
  retroactivamente los registros ya capturados; cada registro histórico conserva su unidad
  original, visible en los reportes junto al dato.
- **FR-013**: El sistema MUST proveer un formulario de inicio de sesión con correo, contraseña y
  verificación captcha obligatoria.
- **FR-014**: Ante credenciales incorrectas, el sistema MUST mostrar un mensaje genérico sin
  revelar si el correo existe, y MUST permitir reintentar.
- **FR-015**: Ante credenciales correctas, el sistema MUST redirigir al usuario a la página
  principal correspondiente a su rol.
- **FR-016**: El sistema MUST permitir solicitar recuperación de contraseña por correo, enviando
  un enlace de un solo uso con expiración corta.
- **FR-017**: El sistema MUST mostrar siempre el mismo mensaje de confirmación al solicitar
  recuperación de contraseña, exista o no el correo, para no revelar existencia de cuentas.
- **FR-018**: El administrador MUST poder invitar operarios a su empresa capturando nombre y
  correo; el sistema MUST crear el usuario en estado "invitado" con rol `operario` y disparar la
  invitación por correo.
- **FR-019**: Todo operario invitado MUST recibir automáticamente los permisos mínimos por
  defecto de su rol, sin intervención manual del administrador.
- **FR-020**: Mientras un operario no acepte su invitación, su estado MUST mostrarse como
  "Pendiente" en el listado de usuarios del administrador.
- **FR-021**: El administrador MUST poder ver un listado de los operarios de su empresa, con
  búsqueda por nombre y estado visible (activo/pendiente/inactivo).
- **FR-022**: El administrador MUST poder desactivar a un operario, bloqueando su inicio de
  sesión sin eliminar su historial.
- **FR-023**: El administrador MUST poder reenviar la invitación a un operario en estado
  "Pendiente".
- **FR-024**: El sistema MUST impedir la eliminación definitiva de un operario con operaciones
  registradas a su nombre, ofreciendo desactivar en su lugar.
- **FR-025**: El administrador MUST poder eliminar definitivamente a un operario que no tenga
  operaciones registradas.
- **FR-026**: El sistema MUST proveer una pantalla dedicada para que el administrador asigne
  permisos por módulo a cada operario, otorgando el módulo completo o acciones específicas (ver,
  crear, editar, eliminar, cancelar, aprobar, exportar, según aplique a cada módulo).
- **FR-027**: Los permisos de "ver" y "crear" otorgados por defecto MUST aparecer premarcados en
  la pantalla de permisos, y el administrador MUST poder quitarlos.
- **FR-028**: Los permisos de "editar" y "eliminar" NO MUST venir premarcados; el administrador
  MUST otorgarlos explícitamente.
- **FR-029**: Los cambios de permisos MUST reflejarse de inmediato en las capacidades del
  operario, sin requerir que cierre e inicie sesión nuevamente.
- **FR-030**: El sistema MUST proveer una opción visible de "Cerrar sesión" accesible desde el
  menú de perfil para los tres roles.
- **FR-031**: El sistema MUST enviar los correos nativos de autenticación (recuperación de
  contraseña, confirmación de cambio de correo) a través de un proveedor SMTP propio, no el
  mecanismo por defecto de la plataforma de autenticación.
- **FR-032**: El sistema MUST generar y enviar las invitaciones y notificaciones propias (empresa
  desactivada, alertas de vencimiento) con una plantilla propia acorde al sistema de diseño del
  proyecto, usando el mismo proveedor SMTP que los correos nativos.
- **FR-033**: El sistema MUST mantener la sesión de cualquier usuario, incluido el superusuario,
  con la política estándar de expiración y renovación de sesión, sin ajustes adicionales por rol.
- **FR-034**: El sistema MUST distinguir tres roles de usuario — superusuario, administrador y
  operario — cada uno con un conjunto de pantallas y capacidades propio, y el superusuario NO
  MUST estar asociado a ninguna empresa.

### Key Entities

- **Empresa**: tenant del sistema. Nombre, RFC, teléfonos, correo, logo, país, moneda, unidad de
  distancia, unidad de combustible, activa/inactiva, fecha de alta.
- **Usuario**: nombre, correo, rol (superusuario/admin/operario), empresa a la que pertenece
  (nulo para superusuario), activo/inactivo (un mismo campo cubre "desactivado" y "revocado" —
  son el mismo estado con distinta etiqueta según el rol). El estado "Pendiente" que ve el
  administrador mientras el usuario no acepta su invitación no es un campo propio: se deriva de
  si el usuario ya confirmó su correo la primera vez.
- **Permiso**: relación entre un usuario, un módulo y una acción, indicando si está otorgada
  (incluye el comodín "módulo completo"); distingue entre permisos otorgados por defecto y
  otorgados explícitamente por un administrador.
- **Módulo**: una de las 16 áreas funcionales del sistema (vehículos, conductores, mantenimiento,
  combustible, seguros, permisos, reportes, usuarios, configuración, etc.), cada una con su
  propio conjunto de acciones disponibles (ver, crear, editar, eliminar, cancelar, aprobar,
  exportar, según aplique — ej. combustible y mantenimiento no tienen "editar" ni "eliminar" por
  ser inmutables).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un superusuario puede dar de alta una nueva empresa junto con su primer
  administrador en menos de 3 minutos.
- **SC-002**: El 100% de las empresas desactivadas bloquean el inicio de sesión de todos sus
  usuarios desde el siguiente intento de login.
- **SC-003**: El 100% de las invitaciones enviadas (administrador u operario) permiten al
  destinatario establecer su propia contraseña y acceder al sistema sin intervención de soporte.
- **SC-004**: Un administrador puede invitar a un operario nuevo y asignarle permisos granulares
  completos en menos de 2 minutos.
- **SC-005**: Los cambios de permisos realizados a un operario se reflejan en la siguiente acción
  que el operario realice en el sistema, sin requerir cierre de sesión ni una espera perceptible.
- **SC-006**: El 100% de los intentos de login con credenciales incorrectas o correos
  inexistentes reciben el mismo mensaje genérico, sin filtrar si la cuenta existe.
- **SC-007**: El 100% de los registros históricos con unidad de distancia o combustible
  conservan la unidad con la que fueron capturados, visible en los reportes, aun después de que
  la empresa cambie su unidad configurada.
- **SC-008**: Cero eliminaciones definitivas de operarios con operaciones registradas a su nombre
  llegan a completarse.

## Fuera de Alcance

- Que el superusuario pueda entrar a operar dentro de los módulos de negocio de una empresa (ver
  vehículos, combustible, etc. de un tenant específico) — el control de acceso a nivel de datos
  ya lo permite, pero la interfaz para eso no se construye en esta feature.
- Autenticación con proveedores externos (Google, Microsoft) — no fue solicitada; puede agregarse
  después sin rediseño.
- Auditoría detallada de inicios de sesión — solo se audita creación/edición/eliminación de
  entidades de negocio, según la constitución del proyecto, no cada login.
- Alta del primer superusuario del sistema — se asume que se crea manualmente antes de que esta
  feature entre en operación (ver Assumptions).

## Assumptions

- El primer superusuario del sistema se crea manualmente (fuera de la interfaz de esta feature,
  vía script o carga inicial de datos); esta feature no incluye una pantalla de "alta de
  superusuario".
- Al desactivar una empresa, las sesiones ya activas de sus usuarios se cortan en la siguiente
  solicitud autenticada al sistema; no se requiere invalidación de sesión en tiempo real.
- El sistema exige que toda empresa tenga al menos un administrador activo: el superusuario no
  puede revocar al último administrador activo de una empresa sin invitar antes un reemplazo.
- Un enlace de invitación o de recuperación expirado puede reemplazarse generando uno nuevo, sin
  necesidad de volver a dar de alta al usuario.
- La protección contra intentos repetidos de login (fuerza bruta) sigue el comportamiento
  estándar de la plataforma de autenticación subyacente, sin requisitos adicionales explícitos en
  esta feature.
- Si falla el envío de un correo de invitación (proveedor SMTP no disponible), no hay reintento
  automático: la vía de recuperación es que el administrador/superusuario use "reenviar
  invitación" (US8, US9) para generar un nuevo intento de envío. Los correos de notificación que
  no son invitaciones (ej. "empresa desactivada") no tienen ruta de reintento en esta feature — si
  fallan, no se reenvían automáticamente ni hay una acción manual equivalente a "reenviar
  invitación" para ellos.
- Si dos administradores editan los permisos del mismo operario al mismo tiempo, gana la última
  escritura (`PUT /api/usuarios/:id/permisos` reemplaza el conjunto completo, sin bloqueo
  optimista). Se acepta este riesgo por ahora: en el modelo de datos, cada empresa suele operar
  con un solo administrador activo a la vez; si en el futuro esto deja de ser cierto, se revisita
  con un mecanismo de bloqueo optimista (ej. `updated_at` como token de concurrencia).
