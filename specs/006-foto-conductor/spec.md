# Feature Specification: Foto del Conductor

**Feature Branch**: `006-foto-conductor`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "referente a conductores creo debemos hacer una actualizacion, debemos permitir subir una foto del conductor"

## Resumen

Permite al administrador adjuntar una fotografía de un conductor (durante el alta o editando el
registro), visible en su detalle de solo lectura. Reutiliza directamente el patrón ya construido
y validado para la foto del vehículo (Feature 003, US-3.7): mismo bucket privado `documentos`,
mismos límites de archivo, sin historial de versiones — cada reemplazo elimina la foto anterior en
el mismo momento.

## Actores

- **Administrador**: acceso completo (adjuntar, reemplazar) sobre la foto de los conductores de su
  propia empresa.
- **Operario**: requiere permiso `editar` otorgado explícitamente en el módulo `conductores` para
  adjuntar o reemplazar la foto; con solo `ver`, puede consultarla en el detalle.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas y no están abiertas a `/speckit-clarify`:

- **Mismo patrón que la foto del vehículo (Feature 003, US-3.7), sin historial**: la foto es
  opcional, se puede adjuntar durante el alta o después editando el registro; JPG o PNG, máximo
  10 MB (mismos límites y misma función de validación `validarFoto()` ya genérica en
  `app/utils/archivos.ts`, reutilizada tal cual). A diferencia de la licencia (que sí conserva
  historial de versiones, Feature 004), la foto **no** MUST conservar versiones anteriores: un
  puntero `foto_archivo_id` en `conductores` que se reemplaza al subir una nueva, borrando el
  objeto anterior en Storage (y su fila en `archivos`) en el mismo momento del reemplazo — mismo
  criterio ya aplicado a la foto del vehículo.
- **Nuevo valor de enum `foto_conductor`, no reutilizar `foto`**: el enum `tipo_archivo` ya tiene
  un valor `foto`, agregado por Vehículos para sus propias fotos
  (`documentos/foto/{empresa_id}/{vehiculo_id}/{archivo}`). Las políticas RLS de
  `storage.objects` del bucket `documentos` (generalizadas por Feature 004,
  `20260809215241_conductores_ajustes.sql`, sección 3) enrutan el permiso requerido según el
  primer segmento de la ruta: `poliza`/`foto` → módulo `vehiculos`, `licencia` → módulo
  `conductores`. Si la foto del conductor reutilizara el mismo valor `foto` (y por lo tanto la
  misma carpeta de primer nivel), un operario con permiso de escritura en `conductores` pero
  **no** en `vehiculos` no podría subir la foto de un conductor — el mismo permiso que ya le
  permite gestionar todo lo demás del conductor (datos, licencia) quedaría sin efecto sobre su
  foto. Por eso esta feature MUST usar un valor de enum distinto (`foto_conductor`) y su propia
  carpeta de primer nivel (`documentos/foto_conductor/{empresa_id}/{conductor_id}/{archivo}`),
  enrutada al módulo `conductores` igual que la licencia — no una excepción nueva, sino aplicar la
  misma regla que ya existe: cada tipo de documento queda atado únicamente a su propio módulo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrador adjunta y reemplaza la foto de un conductor (Priority: P1)

Como administrador, quiero adjuntar una fotografía de un conductor y poder reemplazarla cuando
sea necesario, para identificarlo visualmente en su detalle.

**Why this priority**: Es la única historia de esta feature — una extensión acotada y de bajo
riesgo sobre Conductores (004), ya construida y probada en su forma equivalente para Vehículos.

**Independent Test**: Dar de alta un conductor adjuntando una foto y confirmar que aparece en su
detalle; reemplazarla por otra y confirmar que la nueva se muestra y la anterior ya no existe en
Storage; intentar adjuntar un archivo inválido (PDF o >10 MB) y confirmar que se rechaza antes de
subirse.

**Acceptance Scenarios**:

1. **Given** el formulario de alta de un conductor, **When** el administrador adjunta una foto
   (JPG o PNG, hasta 10 MB) junto con el resto de los datos y guarda, **Then** el conductor se
   crea con esa foto visible en su detalle.
2. **Given** un conductor sin foto, **When** el administrador edita el registro y adjunta una
   foto, **Then** la foto queda visible en el detalle.
3. **Given** un conductor con una foto ya adjunta, **When** el administrador edita el registro y
   adjunta una foto distinta, **Then** la nueva foto se muestra en el detalle y la anterior deja
   de existir tanto en el registro de archivos como en Storage — sin quedar disponible en ningún
   historial.
4. **Given** el formulario de alta o edición, **When** el administrador intenta adjuntar un
   archivo que no sea JPG o PNG, o que exceda 10 MB, **Then** el sistema lo rechaza antes de
   intentar subirlo, sin bloquear el resto del formulario.
5. **Given** un operario con permiso `editar` otorgado en el módulo `conductores` (sin permiso en
   `vehiculos`), **When** adjunta o reemplaza la foto de un conductor, **Then** la operación
   se completa sin ser bloqueada por RLS.

---

### Edge Cases

- ¿Qué pasa si la subida de la foto falla durante el alta? El conductor ya creado (paso 1) MUST
  conservarse sin foto — mismo criterio que la licencia (FR-005 de Conductores) y la foto del
  vehículo.
- ¿Qué pasa si la subida de una foto nueva falla durante un reemplazo? La foto anterior MUST
  seguir siendo la vigente — el reemplazo (borrado de la anterior) solo ocurre después de que la
  nueva ya quedó vinculada exitosamente, mismo criterio que la foto del vehículo (FR-024 de
  Vehículos).
- ¿Qué pasa si se elimina definitivamente un conductor que tiene una foto adjunta? Ya cubierto por
  la limpieza general de archivos al eliminar un conductor (Conductores FR-016a) — la foto es un
  archivo más de ese conductor, se elimina junto con el resto sin necesidad de lógica adicional.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El administrador (u operario con permiso `editar` en el módulo `conductores`) MUST
  poder adjuntar una foto de un conductor (JPG o PNG, máximo 10 MB) de forma opcional, durante el
  alta o después editando el registro.
- **FR-002**: El sistema MUST rechazar archivos de foto que no sean JPG o PNG, o que excedan
  10 MB, antes de intentar subirlos (mismo criterio que la licencia, FR-004 de Conductores).
- **FR-003**: El administrador MUST poder reemplazar la foto de un conductor; a diferencia del
  archivo de licencia (que conserva historial, FR-010 de Conductores), la foto anterior MUST
  eliminarse (registro en `archivos` y objeto en Storage) en el mismo momento del reemplazo — no
  se conserva historial de versiones de foto.
- **FR-004**: Si la subida de una foto nueva falla durante un reemplazo, la foto anterior MUST
  seguir siendo la vigente — el borrado de la anterior solo ocurre después de que la nueva ya
  quedó vinculada exitosamente.
- **FR-005**: Si la subida de la foto falla durante el alta, el sistema MUST conservar el
  conductor ya creado sin bloquear ni revertir el alta completa.
- **FR-006**: El detalle de solo lectura de un conductor MUST mostrar su foto si tiene una
  adjunta, o un estado vacío si no.
- **FR-007**: Los archivos de foto de conductor MUST usar su propio valor de tipo de documento
  (`foto_conductor`, distinto del `foto` ya usado por Vehículos) y quedar aislados bajo el permiso
  del módulo `conductores`, no del módulo `vehiculos` (Decisiones Confirmadas).

### Key Entities

- **Foto del conductor**: mismo tipo de registro que la licencia (tabla `archivos`), con
  `tipo = 'foto_conductor'` (nuevo valor de enum) y `conductores.foto_archivo_id` como puntero a
  la vigente. Sin historial: cada reemplazo elimina la fila y el objeto de Storage anterior en el
  mismo momento de la operación.

## Fuera de Alcance

- Mostrar la foto en el listado principal de conductores — solo en su detalle (mismo alcance que
  la foto del vehículo, que tampoco aparece en el listado de Vehículos).
- Recorte, edición o redimensionado de la imagen — se sube tal cual la proporciona el usuario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las fotos de conductor adjuntadas correctamente son visibles en su
  detalle de inmediato.
- **SC-002**: El 100% de los reemplazos de foto exitosos dejan exactamente una foto vigente por
  conductor, sin objetos huérfanos en Storage.
- **SC-003**: Un operario con permiso de escritura otorgado únicamente en el módulo `conductores`
  puede adjuntar o reemplazar una foto sin necesitar ningún permiso adicional en `vehiculos`.

## Assumptions

- Se reutiliza `validarFoto()` de `app/utils/archivos.ts` tal cual (ya genérica, sin acoplarse a
  "vehículo" en su lógica) — sin duplicar la validación de tipo/tamaño.
- Referencia visual: `docs/design-references/screens/detalle-conductor-datos-generales.png`
  ("Detalle de Conductor: Datos Generales", generada en Stitch el 2026-08-10). A diferencia de
  Vehículos (foto embebida dentro de la tarjeta de identificación), el mockup muestra la foto en
  su propia tarjeta a la izquierda (avatar grande, nombre debajo, chip de tipo de licencia debajo
  del nombre), con "Datos del conductor" como tarjeta separada a la derecha — ver
  `docs/design-references/screens.md` para el detalle de la adaptación.
