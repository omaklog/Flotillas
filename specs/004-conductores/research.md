# Research: Conductores

Mismo punto de partida que Vehículos (003): revisar qué del esquema ya existe antes de planear
como si se construyera desde cero. El resultado es todavía más favorable que en Vehículos — la
tabla `conductores` y su RLS granular (`tiene_permiso('conductores', ...)`) ya están completas
desde Feature 001, y su columna de estado (`activo`) usa la misma semántica que
`empresas`/`usuarios`, no la invertida de `vehiculos.baja`. El hallazgo real de esta ronda de
research es que las políticas de Storage que Vehículos creó para el bucket `documentos` quedaron
**hardcodeadas** al permiso `vehiculos` y deben generalizarse para que Conductores (y cualquier
tipo de archivo futuro) también puedan usarlas.

## R1 — La tabla `conductores` y su RLS granular ya existen completas

**Decision**: `public.conductores` ya tiene casi todas las columnas que pide `spec.md` (nombre,
apellidos, celular, calle, numero, colonia, numero_licencia, tipo_licencia, fecha_vencimiento_licencia,
licencia_archivo_id, activo). Su RLS también está completo y correcto, confirmado directamente
contra las migraciones aplicadas (no solo `docs/schema-reference/schema.sql`, que solo refleja el
estado *inicial* antes de que `modulos_y_permisos.sql`/`permisos_ver_y_defaults.sql` las
ajustaran):

- `conductores_select` (`permisos_ver_y_defaults.sql`): `es_superusuario() OR (empresa_id =
  empresa_id() AND (rol='admin' OR tiene_permiso('conductores','ver')))`.
- `conductores_write` (`modulos_y_permisos.sql`): `for all`, `es_superusuario() OR (empresa_id =
  empresa_id() AND (rol='admin' OR tiene_permiso('conductores','editar')))` — mismo patrón que
  `vehiculos_write` (research.md R1 de Vehículos): una sola política combinada, sin distinguir
  `'crear'`/`'eliminar'` a nivel de RLS.
- El módulo `conductores` ya está sembrado en `public.modulos` (orden 4, entre `usuarios` y
  `proveedores`) y sus 4 acciones (`ver`/`crear`/`editar`/`eliminar`) en `acciones_disponibles`.

Esta feature no repite ninguno de esos migraciones — solo agrega lo que falta (R2).

**Rationale**: mismo criterio que Vehículos R1/Catálogos Base R1 — verificar el estado real antes
de planear evita migraciones redundantes.

**Alternatives considered**: N/A — se confirmó contra `supabase/migrations/*.sql` (no solo
`docs/schema-reference/schema.sql`) antes de escribir este plan.

## R2 — Falta `motivo_baja` y `UNIQUE(empresa_id, numero_licencia)`

**Decision**: `conductores.numero_licencia` ya es `not null`, pero no tiene restricción de
unicidad; `conductores` tampoco tiene columna `motivo_baja`. Se agregan ambas en una sola
migración, mismo patrón que `20260807184333_placa_vehiculo_obligatoria.sql` (Vehículos) para la
unicidad y `motivo_baja text check (char_length(motivo_baja) <= 150)` (idéntico al de
`vehiculos.motivo_baja`, `initial_schema.sql`) para el motivo.

**Rationale**: FR-002 y FR-012 de `spec.md` lo exigen explícitamente; ya documentado como
Assumption en `spec.md`.

**Alternatives considered**: N/A.

## R3 — Auditoría de `conductores`: reutilizar `private.audit_empresas_usuarios()`, no crear una función nueva

**Decision**: a diferencia de Vehículos (que necesitó `private.audit_vehiculos()` porque
`vehiculos.baja` tiene semántica invertida: `true` = dado de baja), `conductores.activo` ya usa la
misma semántica que `empresas`/`usuarios` (`true` = activo). `private.audit_empresas_usuarios()`
(creada en `20260806044223_empresas_activo_y_auditoria.sql`) ya es genérica: usa `tg_table_name`
como `entidad`, y mapea `old.activo is distinct from new.activo` a `'reactivar'`/`'desactivar'`
sin ningún nombre de tabla hardcodeado. Esta feature solo agrega el trigger:

```sql
create trigger trg_conductores_auditoria
  after insert or update or delete on public.conductores
  for each row execute function private.audit_empresas_usuarios();
```

**Rationale**: constitución §2, sin excepción por tabla — mismo principio que motivó
`private.audit_vehiculos()` en Vehículos, pero aquí no hace falta código nuevo porque la semántica
de `activo` ya coincide con la función existente.

**Alternatives considered**: escribir una función `private.audit_conductores()` dedicada, calcada
de `private.audit_vehiculos()` — rechazada por innecesaria: duplicaría lógica ya generalizada sin
ninguna diferencia de comportamiento real (`activo` de conductores no está invertido, a diferencia
de `baja` de vehículos).

## R4 — Las políticas de `storage.objects` del bucket `documentos` están hardcodeadas a `vehiculos` y deben generalizarse

**Decision**: el bucket `documentos` y sus 4 políticas de `storage.objects`
(`documentos_select`/`insert`/`update`/`delete`) ya existen desde Vehículos
(`20260808174129_vehiculos_storage_auditoria.sql`), pero cada política solo revisa
`tiene_permiso('vehiculos', 'ver'|'editar')` — no hay ninguna forma hoy de que un operario con
solo el permiso `conductores` suba, vea, reemplace o borre un archivo de licencia
(`documentos/licencia/{empresa_id}/{conductor_id}/{archivo}`), aunque el bucket en sí sea
compartido por diseño (Decisiones Confirmadas de `spec.md` de Vehículos). Esta feature **reemplaza**
(drop + create) las 4 políticas para que el permiso requerido dependa del primer segmento de la
ruta (`{tipo}`, ya presente en la convención `{tipo}/{empresa_id}/{entidad_id}/{archivo}`):

- `(storage.foldername(name))[1] in ('poliza', 'foto')` → requiere `tiene_permiso('vehiculos',
  'ver'|'editar')` (sin cambio de comportamiento para Vehículos).
- `(storage.foldername(name))[1] = 'licencia'` → requiere `tiene_permiso('conductores',
  'ver'|'editar')` (nuevo, esta feature).
- `rol = 'admin'` o `es_superusuario()` siguen bastando por sí solos en cualquier caso, igual que
  antes.

**Rationale**: FR-017 (aislamiento por empresa, ya cubierto por el segmento `[2]` sin cambios) más
la necesidad real de que el módulo de permisos granulares de Conductores tenga efecto también
sobre sus propios archivos — hoy no lo tendría, sería un permiso otorgado sin efecto práctico
sobre la mitad del flujo (subir/reemplazar/ver la licencia). Generalizar por segmento de ruta en
vez de agregar un tercer `OR tiene_permiso('conductores', ...)` a secas evita que un operario con
solo permiso de `conductores` pueda, sin querer, tocar archivos de `poliza`/`foto` de vehículos
(o viceversa) — cada tipo de documento queda atado únicamente a su propio módulo.

**Alternatives considered**: agregar un tercer `OR` genérico
(`tiene_permiso('vehiculos',...) OR tiene_permiso('conductores',...)`) sin distinguir por
segmento de ruta — rechazado porque le daría a cualquier operario con *cualquiera* de los dos
permisos acceso de escritura sobre *ambos* tipos de archivo, una sobre-concesión de permisos no
pedida por ningún requisito; mantener una política por tipo de documento (un bucket nuevo por
tipo) — rechazado explícitamente ya en Vehículos ("un solo bucket privado, subcarpetas por tipo y
empresa").

## R5 — `archivos_delete` necesita aceptar también `tiene_permiso('conductores', 'editar')`

**Decision**: `archivos_delete` ya fue ajustada por Vehículos (`20260808174129_...sql`) para
aceptar `tiene_permiso('vehiculos','editar')` además de `rol = 'admin'` a secas (era la política
original de `initial_schema.sql`). Esta feature la ajusta de nuevo para agregar
`tiene_permiso('conductores','editar')` al mismo `OR`, necesario para que un operario con permiso
de escritura sobre `conductores` (pero no sobre `vehiculos`) pueda disparar la limpieza de
`archivos` al eliminar un conductor (FR-016a).

**Rationale**: mismo razonamiento que la propia nota de Vehículos en `data-model.md` — el operario
ya puede editar/eliminar el conductor mismo vía `conductores_write` (R1); sin este ajuste, ese
mismo operario podría eliminar el conductor pero la limpieza de sus archivos de licencia fallaría
silenciosamente por RLS, dejando huérfanos.

**Alternatives considered**: mover la limpieza de `archivos` a una función `security definer` que
bypasee RLS — rechazado por la misma razón que R7 (sin `service_role` en el cliente); ajustar la
política sigue siendo la opción más simple y consistente con lo ya hecho en Vehículos.

## R6 — `asignaciones_conductor_vehiculo` se crea ahora, tal cual el diseño ya existente (Clarifications, sesión 2026-08-09)

**Decision**: se aplica `docs/schema-reference/schema_06_asignaciones_conductor_vehiculo.sql` sin
modificarla — tabla, índice único parcial (`vehiculo_id` con `fecha_fin is null`, un vehículo solo
puede tener una asignación activa a la vez), RLS (`select`/`write` condicionados al mismo permiso
`tiene_permiso('vehiculos', 'ver'|'editar')` que ya usa esa definición pre-diseñada — no
`conductores`, porque la asignación se gestiona desde el detalle del *vehículo*, decisión ya
tomada al redactar esa migración), e índices de FK. Esta feature no construye ninguna UI sobre
esta tabla — solo existe para que FR-015/FR-016 (bloqueo de eliminación de un conductor con
asignaciones) sea probable de punta a punta desde ahora.

**Rationale**: Clarifications sesión 2026-08-09 — evita que Feature 005 tenga que tocar el
esquema de esta tabla más allá de construir su UI, y permite escribir un test E2E real (no
mockeado) para el escenario 2 de US-6.

**Alternatives considered**: dejarla pendiente para Feature 005 — descartada por el usuario en la
ronda de `/speckit-clarify` de esta feature, exactamente por el motivo de testabilidad de arriba.

## R7 — Sin `server/api/` nuevos: todo el flujo es client-side

**Decision**: igual que Vehículos (research.md R5) y Catálogos Base, ninguna operación de esta
feature requiere `service_role`: alta en dos pasos, reemplazo de licencia, desactivación/
reactivación, eliminación con limpieza de archivos (FR-016a) se implementan con
`useSupabaseClient()` directo, protegidos por la RLS de `conductores` y `archivos`/
`storage.objects` (R1, R4, R5).

**Orden de la eliminación con limpieza (FR-016a)**: idéntico al de Vehículos (research.md R5 de
esa feature) — 1) `DELETE` del conductor primero (si lo rechaza `asignaciones_conductor_vehiculo`
vía `23503`, detenerse ahí); 2) si tuvo éxito, `DELETE` de sus filas en `archivos`; 3)
`storage.remove()` de los objetos correspondientes.

**Rationale**: ninguna operación necesita bypass de RLS.

**Alternatives considered**: mismas consideradas y rechazadas en Vehículos research.md R5 — no se
repiten aquí.

## R8 — Subida/descarga de archivos: reutilizar `app/utils/archivos.ts` tal cual, sin extenderlo

**Decision**: `validarArchivo()` (PDF/JPG/PNG, ≤10 MB) y `nombreArchivoUnico()`
(`app/utils/archivos.ts`, creadas en Vehículos) ya son genéricas — no mencionan vehículos en su
firma ni su lógica. Esta feature las reutiliza tal cual para la licencia, sin duplicar ni
extender ese archivo. Subida vía `client.storage.from('documentos').upload(...)` sin `upsert`
(cada versión de licencia es un objeto nuevo, mismo criterio que la póliza — Vehículos research.md
R6); descarga/previsualización vía `createSignedUrl` (con y sin `download`, mismo patrón que
`descargarArchivo`/`verArchivo` de Vehículos).

**Rationale**: evita duplicación real; ambas funciones ya estaban diseñadas sin acoplarse a
"vehículo" en ningún punto (revisado directamente en el código fuente).

**Alternatives considered**: copiar `validarArchivo`/`nombreArchivoUnico` a un archivo propio de
Conductores — rechazado, duplicaría lógica idéntica sin ninguna razón de negocio distinta.

## R9 — Composable propio `useConductores.ts`, no reutilizar `useVehiculos.ts` ni `useCatalogo.ts`

**Decision**: mismo razonamiento que Vehículos research.md R7 sobre `useCatalogo.ts` — el CRUD de
conductores tiene su propia forma (alta en dos pasos, desactivar/reactivar con motivo, historial
de versiones de archivo, eliminar-con-limpieza) que no encaja en el composable genérico de
Catálogos Base. Tampoco se reutiliza `useVehiculos.ts` — aunque el molde es casi idéntico, es una
entidad y una tabla distintas; forzar un composable compartido entre ambas mezclaría dos
responsabilidades sin ganancia real (el propio código de `useVehiculos.ts` ya está acoplado a la
tabla `vehiculos` en sus nombres de columna y tipos).

**Rationale**: mismo criterio de "no forzar abstracciones que no encajan limpio" ya aplicado en
Vehículos. El *patrón* se reutiliza (mismo shape de funciones, mismo manejo de errores
`23505`/`23503`), el *código* no.

**Alternatives considered**: extraer un composable genérico `useEntidadConArchivo()` parametrizado
por tabla/columna-puntero/carpeta de Storage, compartido entre Vehículos y Conductores —
considerado pero rechazado por ahora: solo 2 casos de uso no justifican la abstracción todavía
(la guía del proyecto prefiere 2-3 líneas similares sobre una abstracción prematura); si
Combustible o Mantenimiento repiten el mismo molde con un tercer caso, vale la pena reconsiderar.

## R10 — Referencias visuales: sin captura propia todavía, se reutiliza el lenguaje visual y los patrones ya construidos

**Decision**: no existe una referencia de Stitch específica para Conductores (listado, formulario,
detalle). Se sigue `docs/design-system.md` y se replican directamente los patrones de layout ya
implementados y validados visualmente en Vehículos: listado en `v-table` con buscador y badge de
vigencia (mismo componente `app/pages/admin/vehiculos/index.vue` como plantilla estructural, no
copiado literal), detalle de solo lectura en tarjetas con pestañas, historial de archivo en tabla
con acciones "Ver"/"Descargar"/"Subir Nueva Licencia" (idéntico al de
`app/components/vehiculos/HistorialPoliza.vue` tras su rediseño). Si en algún punto se genera una
referencia real de Stitch para Conductores, se sigue la regla de `CLAUDE.md` de ajustarse a ella
antes de seguir iterando visualmente.

**Rationale**: reusar un patrón ya construido y validado en producción local reduce el riesgo de
inconsistencia visual frente a generar algo nuevo sin referencia — mismo espíritu de la regla de
`CLAUDE.md` (no inventar valores de diseño), aplicado a nivel de patrón de pantalla completo
cuando no hay mockup pixel-a-pixel disponible.

**Alternatives considered**: bloquear esta feature hasta generar una referencia de Stitch —
rechazado; a diferencia de una decisión de color/espaciado puntual, aquí sí existe un patrón de
pantalla completo ya construido y aprobado en el propio proyecto que sirve como referencia
suficientemente específica.

---

## Actualización posterior (2026-08-10): Foto del Conductor

Especificada, planeada e implementada originalmente como Feature 006 independiente; doblada aquí
el 2026-08-10 a pedido del usuario (ver spec.md, "Actualización posterior"). R11 y R12 cubren las
únicas 2 decisiones técnicas propias de esa actualización — el resto es aplicación directa de
patrones ya cubiertos por R1-R10 arriba.

## R11 — Nuevo valor de enum `foto_conductor`, y su propio segmento en las políticas de `storage.objects`

**Decision**: se agrega `foto_archivo_id uuid references public.archivos(id)` a `conductores`
(nullable, mismo criterio que `vehiculos.foto_archivo_id`). `alter type tipo_archivo add value
'foto_conductor'` (mismo mecanismo que Vehículos usó para `'foto'` — en su propia transacción,
sin insertar filas que usen el valor nuevo en la misma migración). Las 4 políticas de
`storage.objects` del bucket `documentos` (ya generalizadas por R4 de esta misma feature) se
reemplazan de nuevo (drop + create) agregando un tercer segmento:
`(storage.foldername(name))[1] = 'foto_conductor'` → `tiene_permiso('conductores', 'ver'|'editar')`,
además de las dos ramas ya existentes (`poliza`/`foto` → `vehiculos`, `licencia` → `conductores`).

**Rationale**: reutilizar el valor `foto` (y por lo tanto la misma carpeta de primer nivel) habría
enrutado el permiso requerido al módulo `vehiculos` en vez de `conductores` — un operario con
`editar` solo en `conductores` no habría podido subir la foto de un conductor, aunque ese mismo
permiso ya le alcanza para todo lo demás del conductor (datos, licencia). Un valor de enum y un
segmento de ruta propios mantienen la regla ya establecida por R4: cada tipo de documento atado a
un solo módulo.

**Alternatives considered**: agregar `'foto_conductor'` a la lista de la rama `conductores` ya
existente sin cambiar el nombre de la carpeta (dejar el archivo bajo `foto/...` pero con
`tipo='foto_conductor'` en la fila de `archivos`) — rechazado: la política de `storage.objects`
solo puede leer el *nombre del objeto* (la ruta), no el `tipo` de la fila de `archivos`
correspondiente; el segmento de carpeta es la única señal disponible para esa política, así que
debe ser distinto.

## R12 — UI: dropzone con el mismo marcado ya validado, detalle según referencia de Stitch propia

**Decision**: `FormularioConductor.vue` agrega una zona de adjuntar foto idéntica en estructura a
la de `FormularioVehiculo.vue` (`role="button"`, `tabindex="0"`, input oculto,
`data-testid="foto-input"`, validación vía `validarFoto()` — ya genérica, reutilizada tal cual sin
duplicar lógica). `useConductores.ts` agrega su propio `adjuntarFoto(conductorId, archivo)`,
calcado del de `useVehiculos.ts`: sube el archivo, inserta la fila de `archivos`
(`tipo='foto_conductor'`), actualiza `conductores.foto_archivo_id`, y solo *después* de que eso
tuvo éxito borra la foto anterior (si había) — nunca al revés, para no perder la vigente si un
paso intermedio falla.

Para el detalle de solo lectura (`[id]/index.vue`), a diferencia del resto de Conductores (R10, sin
captura propia), esta actualización sí tiene una referencia de Stitch propia:
`docs/design-references/screens/detalle-conductor-datos-generales.png` ("Detalle de Conductor:
Datos Generales", 2026-08-10). A diferencia de Vehículos (foto embebida como bloque 240×180 dentro
de la tarjeta de datos), el mockup separa la pestaña "Datos" en 2 tarjetas: una angosta a la
izquierda con la foto como avatar grande, el nombre completo debajo, y un chip de tipo de
licencia debajo del nombre; y "Datos del conductor" como tarjeta ancha a la derecha, sin cambios
sobre los campos que ya existían.

**Rationale**: `CLAUDE.md` exige seguir la referencia de Stitch en vez de inventar el layout una
vez que existe una captura para la pantalla específica — prioriza esa referencia sobre la
consistencia entre módulos (R10) cuando ambas están disponibles. `useConductores.ts` no comparte
código con `useVehiculos.ts` (mismo criterio ya aplicado por R9) — el patrón se replica, el código
no.

**Alternatives considered**: mantener el patrón de Vehículos (foto embebida en la misma tarjeta
que los datos) por consistencia entre módulos — rechazado por la razón de Rationale arriba.
