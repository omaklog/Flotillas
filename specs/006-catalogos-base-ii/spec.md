# Feature Specification: Catálogos Base II (Proveedores + Productos)

**Feature Branch**: `006-catalogos-base-ii`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Feature 006 — Catálogos Base II (Proveedores + Productos):
administración de los 2 catálogos por empresa que Combustible y Mantenimiento necesitan como
prerrequisito — proveedores (con activo/inactivo) y productos (clasificados por tipo)."

## Resumen

Administra los 2 catálogos por empresa que Combustible (007) y Mantenimiento (futura) necesitan
como prerrequisito: proveedores y productos (clasificados por tipo: refacción, combustible,
servicio, llanta, consumible). Deliberadamente chica — igual que Catálogos Base (002) — sin
lógica de negocio propia más allá de la administración básica de cada catálogo.

## Actores

- **Administrador**: acceso completo (alta, edición, desactivación/reactivación de proveedores,
  eliminación de ambos catálogos) sobre los proveedores y productos de su propia empresa.
- **Operario**: tiene permiso `ver` otorgado por defecto en ambos módulos (`proveedores`,
  `productos`) — puede consultar sin configuración adicional. Cualquier escritura (crear, editar,
  eliminar) requiere permiso explícito otorgado por un administrador; no viene por defecto.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Proveedores tiene activo/inactivo, mismo patrón completo que Vehículos/Conductores**: botón
  "Desactivar" con modal que exige un motivo (máximo 150 caracteres), botón "Reactivar" sobre un
  proveedor inactivo. El listado oculta los inactivos por defecto, con un control "Mostrar
  inactivos" para incluirlos. Productos **no** tiene este patrón — solo alta, edición y
  eliminación (mismo criterio que los catálogos simples de Catálogos Base, 002).
- **El campo `tipo` de un producto se bloquea para edición una vez que tiene registros
  asociados** (una carga de combustible o un detalle de mantenimiento que lo referencian) —
  cambiarlo después reclasificaría retroactivamente reportes históricos que dependan de ese tipo.
  Antes de tener cualquier registro asociado, es editable libremente. El campo se deshabilita
  visualmente en ese caso, con un tooltip explicando por qué.
- **Eliminación de ambos catálogos bloqueada por dependientes**: ya protegido a nivel de base de
  datos por las llaves foráneas correspondientes (sin `ON DELETE CASCADE`) — esta feature solo
  traduce el error de Postgres a un mensaje claro, mismo patrón que Catálogos Base (002).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrador gestiona proveedores (Priority: P1)

Como administrador, quiero dar de alta, consultar, editar y desactivar/reactivar los proveedores
de mi empresa, para tener un catálogo confiable de a quién se le compra combustible o se le paga
un servicio de mantenimiento.

**Why this priority**: Combustible (007) requiere seleccionar un proveedor existente para cada
carga — sin este catálogo administrable, esa feature no es utilizable de punta a punta.

**Independent Test**: Dar de alta un proveedor, confirmar que aparece en el listado y es
seleccionable; editarlo; desactivarlo con un motivo y confirmar que desaparece del listado por
defecto; reactivarlo y confirmar que vuelve a aparecer; intentar eliminar uno con dependientes y
confirmar que se rechaza.

**Acceptance Scenarios**:

1. **Given** el formulario de alta de proveedor, **When** el administrador captura al menos el
   nombre y guarda, **Then** el proveedor se crea y aparece en el listado.
2. **Given** el listado de proveedores, **When** se busca por nombre o por RFC, **Then** se
   muestran únicamente los proveedores que coinciden.
3. **Given** el listado de proveedores, **When** se consulta sin activar "Mostrar inactivos",
   **Then** solo se muestran los proveedores activos.
4. **Given** un proveedor activo, **When** el administrador lo desactiva sin capturar un motivo,
   **Then** el sistema bloquea la confirmación.
5. **Given** un proveedor activo, **When** el administrador lo desactiva con un motivo válido,
   **Then** el proveedor pasa a inactivo y desaparece del listado por defecto.
6. **Given** un proveedor inactivo, **When** el administrador lo reactiva, **Then** vuelve a
   aparecer en el listado por defecto.
7. **Given** un proveedor con al menos una carga de combustible o un mantenimiento asociado,
   **When** se intenta eliminarlo definitivamente, **Then** el sistema lo rechaza con un mensaje
   claro y no elimina nada.

---

### User Story 2 - Administrador gestiona productos (Priority: P1)

Como administrador, quiero dar de alta, consultar, editar y eliminar los productos de mi empresa
(clasificados por tipo), para tener un catálogo confiable de qué se compra o se usa en cada carga
de combustible o mantenimiento.

**Why this priority**: Combustible (007) requiere seleccionar un producto de tipo "combustible"
existente para cada carga — sin este catálogo administrable, esa feature no es utilizable de
punta a punta. Misma prioridad que Proveedores: ambos son prerrequisitos duros del mismo tipo.

**Independent Test**: Dar de alta un producto de cada tipo, confirmar que aparecen en el listado y
son filtrables por tipo; editar uno sin registros asociados y confirmar que el tipo es editable;
simular que un producto ya tiene un registro asociado y confirmar que su tipo queda bloqueado para
edición; intentar eliminar un producto con dependientes y confirmar que se rechaza.

**Acceptance Scenarios**:

1. **Given** el formulario de alta de producto, **When** el administrador captura nombre, tipo
   (obligatorio) y guarda, **Then** el producto se crea y aparece en el listado.
2. **Given** el listado de productos, **When** se busca por nombre o se filtra por tipo, **Then**
   se muestran únicamente los productos que coinciden.
3. **Given** un producto sin ningún registro asociado, **When** el administrador lo edita,
   **Then** todos los campos, incluido el tipo, son editables.
4. **Given** un producto con al menos una carga de combustible o un detalle de mantenimiento
   asociado, **When** el administrador abre su edición, **Then** el campo tipo aparece
   deshabilitado, con una explicación de por qué no se puede cambiar.
5. **Given** un producto con al menos una carga de combustible o un detalle de mantenimiento
   asociado, **When** se intenta eliminarlo definitivamente, **Then** el sistema lo rechaza con un
   mensaje claro y no elimina nada.

---

### Edge Cases

- ¿Qué pasa si se reactiva un proveedor? El motivo de la desactivación anterior no se limpia —
  queda como registro histórico visible en la auditoría, mismo criterio que Vehículos/Conductores.
- ¿Qué pasa si se elimina un proveedor o producto sin ningún dependiente? Procede sin error.
- ¿Qué pasa si dos proveedores o productos de la misma empresa tienen el mismo nombre? Se permite
  — no hay una restricción de unicidad sobre `nombre` declarada para ninguno de los dos catálogos.
- ¿Qué pasa si se intenta cambiar el tipo de un producto bloqueado manipulando la petición
  directamente (no vía UI)? Fuera de alcance de esta feature a nivel de aplicación — RLS no
  distingue por valor de columna, así que este caso queda como validación de UI únicamente (ver
  Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir dar de alta un proveedor con nombre (obligatorio), RFC,
  domicilio (calle, número, colonia), dos teléfonos de oficina, celular y correo (el resto,
  opcional).
- **FR-002**: El sistema MUST permitir buscar proveedores por nombre o por RFC.
- **FR-003**: El listado de proveedores MUST ocultar los inactivos por defecto, con un control
  para incluirlos.
- **FR-004**: El sistema MUST permitir editar cualquier campo de un proveedor.
- **FR-005**: El sistema MUST permitir desactivar un proveedor únicamente con un motivo capturado
  (máximo 150 caracteres) y reactivarlo sin requerir motivo.
- **FR-006**: El sistema MUST rechazar la eliminación de un proveedor que tenga al menos una carga
  de combustible o un mantenimiento asociado, con un mensaje claro.
- **FR-007**: El sistema MUST permitir dar de alta un producto con nombre y tipo (obligatorios;
  tipo es uno de refacción, combustible, servicio, llanta o consumible) y una unidad de medida en
  texto libre (opcional).
- **FR-008**: El sistema MUST permitir buscar productos por nombre y filtrarlos por tipo.
- **FR-009**: El sistema MUST permitir editar cualquier campo de un producto, salvo el tipo una
  vez que el producto tiene al menos un registro asociado (carga de combustible o detalle de
  mantenimiento) — en ese caso, el campo tipo MUST mostrarse deshabilitado con una explicación
  visible de por qué.
- **FR-010**: El sistema MUST rechazar la eliminación de un producto que tenga al menos una carga
  de combustible o un detalle de mantenimiento asociado, con un mensaje claro.
- **FR-011**: Un operario sin permiso de escritura otorgado explícitamente en el módulo
  `proveedores` o `productos` MUST poder consultar (listar, buscar, ver los datos capturados) pero
  no crear, editar, desactivar/reactivar ni eliminar registros de ese catálogo.

### Key Entities

- **Proveedor**: nombre, RFC, domicilio (calle/número/colonia), dos teléfonos de oficina, celular,
  correo, estado activo/inactivo y motivo de baja (solo si inactivo).
- **Producto**: nombre, tipo (refacción/combustible/servicio/llanta/consumible), unidad de medida
  en texto libre. Sin estado activo/inactivo — solo alta, edición (con la excepción de FR-009) y
  eliminación.

## Fuera de Alcance

- Selección de productos o proveedores dentro de un flujo de captura real (Combustible,
  Mantenimiento) — eso vive en esas features; esta solo administra los catálogos.
- Reportes de gasto o consumo por proveedor o producto — pertenecen a una feature de Reportes
  futura.
- Bloquear a nivel de base de datos (RLS o trigger) el cambio del campo `tipo` de un producto con
  registros asociados — FR-009 se implementa como validación de UI; ver Edge Cases.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los intentos de eliminar un proveedor o producto con registros
  dependientes son rechazados, sin eliminar nada.
- **SC-002**: El 100% de los productos con al menos un registro asociado bloquean la edición de su
  campo tipo.
- **SC-003**: Un administrador puede localizar un proveedor o producto específico dentro de un
  catálogo de decenas de registros usando el buscador, sin recorrer el listado completo.
- **SC-004**: El 100% de los intentos de escritura (crear, editar, desactivar, eliminar) por parte
  de un operario sin el permiso explícito correspondiente son bloqueados.

## Assumptions

- **Esquema base ya existente**: las tablas `proveedores` y `productos`, el enum `tipo_producto`
  (ya incluye los 5 valores necesarios), y el módulo de permisos granular (`ver`/`crear`/
  `editar`/`eliminar`, con `ver` otorgado por defecto a todo operario nuevo) existen desde la
  migración inicial del proyecto — verificado contra el esquema real. Esta feature no los crea,
  solo construye la UI y la lógica de negocio sobre ellos.
- **`proveedores.activo`/`motivo_baja` son el único trabajo de Foundational nuevo**: no existen
  todavía en el esquema — `docs/schema-reference/schema_08_proveedores_activo.sql` los agrega, y
  esta feature MUST tratar esa migración como prerrequisito antes de construir la UI de
  desactivar/reactivar.
- **La referencia a un precedente de "bloqueo de campo tras tener registros asociados" en las
  unidades de medida de la empresa (Feature 001) no se encontró en el código actual** —
  `unidad_distancia`/`unidad_combustible` en la configuración de la empresa son editables sin
  ninguna validación de ese tipo hoy. FR-009 (bloquear `tipo` de un producto con registros
  asociados) es una decisión de negocio válida y se implementa tal cual se pidió, pero como lógica
  nueva de esta feature, no como reutilización de un patrón ya construido.
- **Sin referencia visual de Stitch propia**: se sigue el lenguaje visual de
  `docs/design-system.md` y se reutilizan directamente los patrones ya construidos y validados en
  el proyecto — listado con buscador (Catálogos Base, 002) para ambos catálogos, filtro adicional
  por tipo para Productos (mismo patrón de filtro ya usado en el listado de Vehículos), y el flujo
  completo de activo/inactivo con motivo obligatorio (Vehículos/Conductores) para Proveedores.
- **Sin restricción de unicidad sobre `nombre`** en ninguno de los dos catálogos, salvo que el
  esquema real indique lo contrario al revisar `data-model.md` en la fase de planeación.
