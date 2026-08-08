# Feature Specification: Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos)

**Feature Branch**: `002-catalogos-base`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Feature 002 — Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos). Administración de los 3 catálogos por empresa que Vehículos necesita como prerequisito: tipos de vehículo, compañías de seguro, y tipos de permisos aplicables. Deliberadamente chica: establece el patrón de CRUD (tabla + búsqueda + alta + edición + bloqueo de eliminación con dependientes) con las 3 entidades más simples del sistema, antes de construir Vehículos (003) sobre ese mismo molde."

## Resumen

Esta feature administra los tres catálogos de configuración que la futura feature de Vehículos
(003) necesita como prerequisito: tipos de vehículo, compañías de seguro y tipos de permisos
aplicables. Las tres son deliberadamente las entidades más simples del sistema — sin archivos
adjuntos, sin relaciones complejas — y existen para establecer el patrón general de CRUD de
catálogo (listado con búsqueda, alta, edición, eliminación protegida por dependientes) que
Vehículos y features posteriores reutilizarán.

## Actores

- **Administrador**: único actor con capacidad de alta, edición y eliminación sobre los tres
  catálogos de su propia empresa. Acceso completo por rol, como en el resto de la aplicación.
- **Operario**: tiene acceso de solo lectura a los tres catálogos por defecto (permiso "ver"
  otorgado automáticamente al invitarse, según el esquema de permisos de la Feature 001); no
  puede crear, editar ni eliminar salvo que el administrador le otorgue esos permisos
  explícitamente.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Eliminación bloqueada por dependientes ya garantizada en base de datos**: las foreign keys de
  `vehiculos.tipo_vehiculo_id`, `vehiculos.aseguradora_id` y `vehiculo_permisos.permiso_id` no
  tienen `ON DELETE CASCADE`, por lo que Postgres rechaza por sí solo cualquier intento de borrar
  un registro de catálogo en uso. Esta feature solo necesita capturar ese error de base de datos
  y mostrarlo como un mensaje claro (p. ej. "No se puede eliminar: hay vehículos usando este
  tipo"); no reimplementa esa validación. La protección aplica desde ahora aunque Vehículos (003)
  todavía no exista para ejercerla de punta a punta.
- **Catálogos aislados por empresa**: cada uno de los tres catálogos es propio de cada empresa
  (multi-tenant), igual que el resto del sistema — ninguna empresa ve ni puede referenciar
  catálogos de otra.
- **Siembra automática de tipos de vehículo**: al darse de alta una empresa nueva (Feature 001,
  US-1.1), el sistema siembra automáticamente 3 tipos de vehículo predefinidos para que el
  administrador no arranque con el catálogo vacío. Compañías de seguro y tipos de permisos
  arrancan vacíos porque no existe un valor genérico razonable para pre-sembrar (varían por
  estado y giro de cada empresa).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrador gestiona tipos de vehículo (Priority: P1)

Como administrador, quiero mantener el catálogo de tipos de vehículo de mi empresa (ligero,
pesado, materiales peligrosos, u otros que agregue), para poder clasificar cada vehículo cuando
la feature de Vehículos exista.

**Why this priority**: Es el catálogo que primero necesita Vehículos (003) y el que define el
molde de CRUD — incluyendo el caso más complejo de los tres: la clave editable con
autogeneración opcional y la siembra automática al crear una empresa. Resolverlo primero
desbloquea el patrón para las otras dos historias.

**Independent Test**: Puede probarse por completo dando de alta una empresa nueva (para verificar
la siembra de los 3 tipos predefinidos), y luego creando, editando y — sobre un tipo sin
vehículos asociados — eliminando un tipo de vehículo adicional, todo sin depender de que exista
Vehículos.

**Acceptance Scenarios**:

1. **Given** una empresa recién creada, **When** el administrador abre el catálogo de tipos de
   vehículo por primera vez, **Then** ve ya sembrados los 3 tipos predefinidos ("Vehículo
   ligero", "Servicio pesado (más de 3.5 toneladas)", "Transporte de materiales peligrosos") con
   sus claves `ligero`, `pesado` y `mat_peligrosos`.
2. **Given** el administrador está en el formulario de alta, **When** escribe un nombre y
   presiona "Autogenerar" junto al campo de clave, **Then** el campo de clave se llena con una
   propuesta en minúsculas, sin acentos ni caracteres especiales, con espacios convertidos a
   guion bajo, y el administrador puede aceptarla o seguir editándola a mano.
3. **Given** el administrador escribe manualmente una clave, **When** la clave no cumple el
   formato `^[a-z0-9_]+$`, contiene espacios, o excede 50 caracteres, **Then** el formulario
   muestra un error de validación y no permite enviar.
4. **Given** ya existe un tipo de vehículo con la clave `pesado` en la empresa, **When** el
   administrador intenta crear otro con la misma clave, **Then** el formulario lo marca como
   duplicado antes de enviar.
5. **Given** un tipo de vehículo con vehículos asociados (una vez exista Vehículos), **When** el
   administrador intenta eliminarlo, **Then** el sistema rechaza la eliminación y muestra "No se
   puede eliminar: hay vehículos usando este tipo".
6. **Given** un tipo de vehículo sin vehículos asociados, **When** el administrador lo elimina,
   **Then** el registro desaparece del catálogo sin error.
7. **Given** el catálogo tiene varios tipos de vehículo, **When** el administrador busca por
   nombre, **Then** el listado se filtra a los que coinciden.

---

### User Story 2 - Administrador gestiona compañías de seguro (Priority: P2)

Como administrador, quiero mantener el catálogo de compañías de seguro de mi empresa, para poder
asociar cada vehículo a su aseguradora cuando la feature de Vehículos exista.

**Why this priority**: Reutiliza el mismo patrón de CRUD que US1, sin la complejidad adicional de
clave/autogeneración ni de siembra automática — la segunda pieza más simple.

**Independent Test**: Puede probarse por completo dando de alta, editando, buscando y — sobre una
aseguradora sin vehículos asociados — eliminando una compañía de seguro, todo sin depender de que
exista Vehículos.

**Acceptance Scenarios**:

1. **Given** una empresa recién creada, **When** el administrador abre el catálogo de
   aseguradoras por primera vez, **Then** el catálogo está vacío.
2. **Given** el administrador está en el formulario de alta, **When** captura razón social y RFC
   y guarda, **Then** la aseguradora aparece en el listado.
3. **Given** una aseguradora asociada a un vehículo (una vez exista Vehículos), **When** el
   administrador intenta eliminarla, **Then** el sistema rechaza la eliminación y muestra un
   mensaje claro equivalente a "No se puede eliminar: hay vehículos usando esta aseguradora".
4. **Given** una aseguradora sin vehículos asociados, **When** el administrador la elimina,
   **Then** el registro desaparece del catálogo sin error.
5. **Given** el catálogo tiene varias aseguradoras, **When** el administrador busca por nombre o
   por RFC, **Then** el listado se filtra a las que coinciden.

---

### User Story 3 - Administrador gestiona catálogo de permisos aplicables (Priority: P3)

Como administrador, quiero mantener el catálogo de tipos de permiso (estatales y federales) que
mi empresa necesita tramitar por vehículo, para poder asignarlos cuando la feature de Vehículos
exista.

**Why this priority**: Reutiliza el mismo patrón de clave/autogeneración de US1, pero al ser la
tercera entidad del mismo molde aporta el menor valor incremental de las tres.

**Independent Test**: Puede probarse por completo dando de alta, editando, buscando y — sobre un
permiso sin vehículos asociados vía `vehiculo_permisos` — eliminando un tipo de permiso, todo sin
depender de que exista Vehículos.

**Acceptance Scenarios**:

1. **Given** una empresa recién creada, **When** el administrador abre el catálogo de permisos
   por primera vez, **Then** el catálogo está vacío.
2. **Given** el administrador está en el formulario de alta, **When** captura clave (o la
   autogenera desde el nombre), nombre y tipo (Estatal o Federal), y guarda, **Then** el permiso
   aparece en el listado con su tipo visible.
3. **Given** ya existe un permiso con una clave determinada en la empresa, **When** el
   administrador intenta crear otro con la misma clave, **Then** el formulario lo marca como
   duplicado antes de enviar.
4. **Given** un tipo de permiso asignado a un vehículo vía `vehiculo_permisos` (una vez exista
   Vehículos), **When** el administrador intenta eliminarlo, **Then** el sistema rechaza la
   eliminación y muestra un mensaje claro equivalente a "No se puede eliminar: hay vehículos con
   este permiso asignado".
5. **Given** un tipo de permiso sin vehículos asociados, **When** el administrador lo elimina,
   **Then** el registro desaparece del catálogo sin error.
6. **Given** el catálogo tiene varios permisos, **When** el administrador busca por nombre o por
   clave, **Then** el listado se filtra a los que coinciden.

---

### Edge Cases

- ¿Qué pasa si el nombre capturado, al autogenerar la clave, queda vacío después de quitar
  acentos y caracteres especiales (p. ej. un nombre compuesto solo de emojis o símbolos)? El
  botón "Autogenerar" no debe producir una clave vacía silenciosamente; el campo de clave queda
  vacío y la validación normal de formato lo marca como requerido.
- ¿Qué pasa si el nombre autogenerado excede 50 caracteres una vez normalizado? La propuesta se
  trunca a 50 caracteres; el administrador puede editarla a mano si el resultado no le sirve.
- ¿Qué pasa si dos empresas distintas usan la misma clave (p. ej. `pesado` en ambas) para su
  catálogo de tipos de vehículo? Es válido: la unicidad de clave es por empresa, no global.
- ¿Qué pasa si el administrador edita el nombre o la clave de un tipo/aseguradora/permiso que ya
  tiene vehículos asociados? La edición se permite libremente — la relación con vehículos se
  guarda por identificador interno, no por clave ni nombre, así que renombrar no rompe ninguna
  asociación existente.
- ¿Qué pasa si la búsqueda no encuentra coincidencias? El listado muestra un estado vacío
  distinguible del estado "catálogo sin ningún registro todavía".
- ¿Qué pasa si el administrador intenta eliminar un registro justo cuando otro usuario lo acaba
  de asociar a un vehículo? El `DELETE` es rechazado por la base de datos en ese mismo momento
  (la restricción de integridad referencial se evalúa en el momento de la operación, no antes),
  así que no hay condición de carrera: el mensaje de error se muestra igual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST proveer, para cada uno de los tres catálogos (tipos de vehículo,
  aseguradoras, tipos de permiso), un listado propio de la empresa del usuario, con buscador de
  texto libre (por nombre en los tres; adicionalmente por RFC en aseguradoras y por clave en
  tipos de permiso).
- **FR-002**: El administrador MUST poder dar de alta un tipo de vehículo capturando clave y
  nombre.
- **FR-003**: El administrador MUST poder dar de alta una compañía de seguro capturando razón
  social y RFC.
- **FR-004**: El administrador MUST poder dar de alta un tipo de permiso capturando clave,
  nombre y tipo (Estatal o Federal).
- **FR-005**: Para tipos de vehículo y tipos de permiso, el campo de clave MUST validarse en el
  formulario contra el patrón `^[a-z0-9_]+$` (solo minúsculas, números y guion bajo, sin
  espacios), con un máximo de 50 caracteres, antes de permitir el envío.
- **FR-006**: Para tipos de vehículo y tipos de permiso, el sistema MUST verificar en el
  formulario si la clave capturada ya existe en la empresa y marcarlo como error antes de enviar,
  además de rechazar el duplicado a nivel de base de datos como respaldo.
- **FR-007**: Para tipos de vehículo y tipos de permiso, el formulario de alta MUST ofrecer un
  botón "Autogenerar" opcional junto al campo de clave que, a partir de lo escrito en "Nombre",
  proponga una clave en minúsculas, sin acentos ni caracteres especiales, con espacios
  convertidos a guion bajo; el administrador puede aceptar la propuesta tal cual o seguir
  editándola a mano.
- **FR-008**: El administrador MUST poder editar los datos de cualquier registro existente en los
  tres catálogos, incluyendo su clave (en tipos de vehículo y tipos de permiso), sujeta a las
  mismas validaciones de formato y unicidad que en el alta.
- **FR-009**: El administrador MUST poder eliminar cualquier registro de los tres catálogos que
  no esté referenciado por ningún vehículo (ni, en el caso de tipos de permiso, por ninguna
  asignación vehículo-permiso).
- **FR-010**: Al intentar eliminar un registro de catálogo que sí está en uso, el sistema MUST
  capturar el error de restricción de integridad referencial de la base de datos y mostrar un
  mensaje explícito indicando que no se puede eliminar porque hay vehículos usándolo, sin
  exponer detalles técnicos del error.
- **FR-011**: Al crear una empresa nueva, el sistema MUST sembrar automáticamente en su catálogo
  de tipos de vehículo los 3 registros predefinidos: "Vehículo ligero" (clave `ligero`),
  "Servicio pesado (más de 3.5 toneladas)" (clave `pesado`) y "Transporte de materiales
  peligrosos" (clave `mat_peligrosos`).
- **FR-012**: El administrador MUST poder editar o eliminar cualquiera de los 3 tipos de vehículo
  sembrados automáticamente, sujeto a la misma protección de eliminación por dependientes que
  cualquier otro registro del catálogo.
- **FR-013**: El catálogo de compañías de seguro y el catálogo de tipos de permiso MUST empezar
  vacíos para toda empresa nueva.
- **FR-014**: Los tres catálogos MUST estar aislados por empresa: ningún administrador MUST poder
  ver, buscar, editar ni eliminar registros de catálogo pertenecientes a otra empresa.
- **FR-015**: Un operario sin permisos de escritura otorgados explícitamente MUST poder ver los
  tres catálogos (listado y búsqueda) pero NO MUST poder crear, editar ni eliminar registros en
  ellos.

### Key Entities

- **Tipo de Vehículo**: catálogo por empresa que clasifica vehículos (p. ej. ligero, pesado,
  materiales peligrosos). Atributos: clave (única por empresa, formato restringido), nombre. Se
  siembra automáticamente con 3 valores al crear la empresa. Referenciado desde Vehículo (feature
  003, aún no construida).
- **Aseguradora**: catálogo por empresa de compañías de seguro. Atributos: razón social, RFC.
  Vacío por defecto. Referenciado desde Vehículo (feature 003).
- **Tipo de Permiso**: catálogo por empresa de permisos aplicables a vehículos (p. ej. estatales o
  federales). Atributos: clave (única por empresa, formato restringido), nombre, tipo (Estatal o
  Federal). Vacío por defecto. Referenciado desde la asignación vehículo-permiso (feature 003,
  fuera de alcance de esta feature).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las empresas nuevas arrancan con exactamente 3 tipos de vehículo ya
  sembrados, sin intervención manual del administrador.
- **SC-002**: Un administrador puede dar de alta un registro nuevo en cualquiera de los tres
  catálogos (formulario completo hasta confirmación) en menos de 1 minuto.
- **SC-003**: El 100% de los intentos de eliminar un registro de catálogo en uso son rechazados
  con un mensaje claro y comprensible, sin que el usuario vea un error técnico crudo.
- **SC-004**: El 100% de los intentos de crear una clave duplicada dentro de la misma empresa son
  detectados por el formulario antes de enviarse, sin depender de que el usuario provoque el
  error de base de datos.
- **SC-005**: Un administrador puede localizar un registro específico dentro de un catálogo de
  hasta 50 elementos usando el buscador en menos de 10 segundos.

## Assumptions

- El formato de RFC de una aseguradora no se valida contra un patrón estricto (persona física vs.
  moral) en esta feature — se captura como texto libre con longitud razonable; validarlo
  formalmente queda fuera de alcance salvo que se indique lo contrario.
- La búsqueda en los tres catálogos es por coincidencia parcial, sin distinguir mayúsculas de
  minúsculas, igual que el resto de listados del sistema (p. ej. el listado de operarios de la
  Feature 001).
- En el esquema de permisos por módulo (Feature 001), cada uno de los tres catálogos se trata
  como su propio módulo a efectos de otorgar permisos granulares a operarios (ver / crear /
  editar / eliminar), siguiendo el mismo patrón ya usado para otros módulos del sistema.
- Los catálogos de esta feature no requieren paginación especial más allá del patrón estándar de
  listados ya usado en el resto de la aplicación, dado su tamaño típicamente pequeño (decenas de
  registros, no miles).
- El mensaje de error al bloquear una eliminación por dependientes sigue el mismo tono y formato
  para las tres entidades, ajustando solo el sustantivo ("tipo", "aseguradora", "permiso"), como
  ya se ilustra en el ejemplo dado para tipos de vehículo.
