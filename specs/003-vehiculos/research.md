# Research: Vehículos

Como en Catálogos Base (002), el punto de partida es revisar qué del esquema ya existe antes de
planear como si se construyera desde cero. El resultado sorprende para bien: casi toda la tabla
`vehiculos` y su RLS ya están completas desde Feature 001; lo que falta es acotado.

## R1 — La tabla `vehiculos`, su RLS y el módulo de permisos ya existen

**Decision**: `public.vehiculos` ya tiene todas las columnas que pide `spec.md` (marca, modelo,
placa, color, numero_serie, numero_motor, capacidad_carga, anio, numero_ejes, tipo_vehiculo_id,
aseguradora_id, numero_poliza, fecha_vencimiento_poliza, poliza_archivo_id, baja, motivo_baja),
con RLS ya aplicado (`vehiculos_select`/`vehiculos_write`, esta última condicionada a
`tiene_permiso('vehiculos','editar')` o rol admin — ya sembrado en
`modulos_y_permisos.sql`/`permisos_ver_y_defaults.sql`). `public.vehiculo_permisos` y
`public.archivos` también ya existen con su RLS (`select`/`insert`/`delete` en `archivos`;
`select`/`write` en `vehiculo_permisos`, esta última bajo el mismo `tiene_permiso('vehiculos',
'editar')`). Esta feature no repite ese trabajo.

**Rationale**: mismo criterio que Catálogos Base R1 — verificar el estado real antes de planear
evita migraciones redundantes.

**Alternatives considered**: N/A — se confirmó contra `supabase/migrations/*.sql` antes de
escribir este plan.

**Hallazgo colateral**: la política `vehiculos_write` (y `vehiculo_permisos_write`) es una sola
política `for all` condicionada únicamente a `tiene_permiso('vehiculos','editar')` — no existen
cheques separados por `'crear'`/`'eliminar'` a nivel de RLS para estas dos tablas (a diferencia de
`cargas_combustible`, que sí distingue `'crear'` de `'cancelar'`). En la práctica, un operario al
que el admin le otorgue el módulo `vehiculos` MUST recibir el permiso `'editar'` para poder
crear/editar/eliminar vehículos o gestionar sus permisos asignados — otorgarle solo `'crear'` no
alcanza para que el `INSERT` pase RLS. No es un bug de esta feature (heredado de Feature 001), pero
condiciona cómo se redacta la ayuda/documentación de la pantalla de permisos si llega a
mencionarse.

## R2 — `placa` ya es `NOT NULL` + `UNIQUE(empresa_id, placa)`

**Decision**: la restricción de placa única por empresa (FR-002) ya está en base de datos desde
una migración de esta misma sesión, previa a Catálogos Base
(`20260807184333_placa_vehiculo_obligatoria.sql`). Esta feature solo necesita la validación de
formulario antes de enviar (mismo patrón que la clave duplicada de Catálogos Base) y mapear el
`23505` como respaldo — no una migración nueva para esto.

**Rationale**: evitar trabajo redundante; confirmado con `\d vehiculos` equivalente vía REST antes
de planear.

**Alternatives considered**: N/A.

## R3 — Falta el bucket de Storage `documentos` y su RLS

**Decision**: crear el bucket `documentos` vía migración SQL (`insert into storage.buckets`,
mismo mecanismo que `20260807010000_storage_logos_empresas.sql` de Feature 001), **privado**
(`public: false`, a diferencia de `logos-empresas`), `file_size_limit: 10485760` (10 MB),
`allowed_mime_types: ['application/pdf', 'image/jpeg', 'image/png']`. Ruta de objeto:
`{tipo}/{empresa_id}/{entidad_id}/{archivo}` — el aislamiento por empresa se verifica con
`(storage.foldername(name))[2]` (segundo segmento, ya que `{tipo}` ocupa el primero; en
`logos-empresas` el segmento de empresa es el `[1]` porque esa ruta no tiene el prefijo de tipo).
Políticas RLS de `storage.objects`, calcadas del molde de `logos-empresas` pero con el
desplazamiento de segmento y el chequeo de `tiene_permiso('vehiculos','editar')` en vez de
`rol = 'admin'` a secas (para permitir a un operario con ese permiso otorgado subir/reemplazar
pólizas):
- `documentos_select`: `es_superusuario() OR (foldername[2] = empresa_id AND (rol='admin' OR
  tiene_permiso('vehiculos','ver')))`.
- `documentos_insert`/`documentos_update`/`documentos_delete`: igual pero con
  `tiene_permiso('vehiculos','editar')`.

**Rationale**: FR-020 (aislamiento por empresa de los archivos) y las Decisiones Confirmadas del
spec ya especifican esta estructura casi literalmente — se sigue el molde ya validado en
producción por `logos-empresas`, con los dos ajustes que el propio spec pide (privado, no
público; desplazamiento de segmento por el prefijo `{tipo}`).

**Alternatives considered**: un bucket por tipo de documento (`polizas`, `licencias`, `facturas`)
en vez de uno solo con subcarpetas — rechazado explícitamente por el spec ("un solo bucket
privado, subcarpetas por tipo y empresa"), y consistente con que `archivos.tipo` ya modela esa
distinción a nivel de fila, no de bucket.

## R4 — Auditoría de `vehiculos`, `vehiculo_permisos` y `archivos`

**Decision**: ninguna de las tres tablas tiene trigger de auditoría todavía (mismo gap que
Catálogos Base encontró en `tipos_vehiculo`/`aseguradoras`/`permisos`, y por la misma razón: nunca
se cerró). Para `vehiculo_permisos` y `archivos` (sin campo de estado tipo `activo`/`baja`) se
reutiliza tal cual `private.audit_catalogo()`, ya creado en la migración de Catálogos Base — no se
duplica. Para `vehiculos`, que sí tiene un campo de estado (`baja boolean`, semántica invertida
respecto a `activo`), se crea una función nueva `private.audit_vehiculos()`: mismo molde que
`private.audit_empresas_usuarios()` (Feature 001), pero evaluando `old.baja is distinct from
new.baja` y mapeando `new.baja = true → 'desactivar'`, `new.baja = false → 'reactivar'` (la
dirección exactamente opuesta a como `audit_empresas_usuarios()` interpreta `activo`).

**Rationale**: constitución §2, sin excepción por tabla. No reutilizar
`audit_empresas_usuarios()` tal cual por la misma razón que Catálogos Base documentó: referencia
`old.activo`/`new.activo` en tiempo de ejecución, columna que `vehiculos` no tiene (tiene `baja`,
además con la semántica booleana invertida).

**Alternatives considered**: generalizar `audit_empresas_usuarios()` para aceptar el nombre de
columna de estado como parámetro — rechazado por complejidad innecesaria (PL/pgSQL no permite
parametrizar el nombre de columna referenciado vía `new.<campo>` sin SQL dinámico); una función
dedicada y corta es más simple de auditar que SQL dinámico.

## R5 — Sin `server/api/` nuevos: todo el flujo, incluida la limpieza al eliminar, es client-side

**Decision**: igual que Catálogos Base (research.md R5 de esa feature), ninguna operación de esta
feature requiere `service_role`: alta en dos pasos, reemplazo de póliza, baja/reactivación,
eliminación con limpieza de archivos (FR-016a), y asignación de permisos al vehículo se
implementan con `useSupabaseClient()` directo, protegidos por la RLS de `vehiculos`,
`vehiculo_permisos`, `archivos` y `storage.objects` (R1, R3).

**Orden de la eliminación con limpieza (FR-016a)**: 1) `DELETE` del vehículo primero — si la base
de datos lo rechaza por dependientes (FR-016), no se toca nada más, mismo comportamiento que
Catálogos Base; 2) si el paso 1 tuvo éxito, `DELETE` de los registros de `archivos` de ese
vehículo; 3) `storage.remove()` de los objetos correspondientes. Este orden es deliberado: si el
paso 1 falla, el estado queda exactamente como antes (consistente); si falla el paso 2 o 3 después
de que el paso 1 ya tuvo éxito, el vehículo ya se eliminó correctamente y solo quedan archivos
huérfanos como peor caso — el mismo resultado que tenía el sistema antes de esta clarificación, no
una regresión.

**Rationale**: ninguna de las operaciones necesita bypass de RLS; introducir un endpoint
intermedio para reenviar lo mismo a Postgres/Storage sería una capa sin valor (mismo razonamiento
que Catálogos Base R5).

**Alternatives considered**: envolver los 3 pasos de eliminación en una función de Postgres
(`security definer`) para atomicidad real — considerado pero rechazado por ahora: added
complexity no justificada para un caso de uso ya acotado por spec como "vehículo dado de alta por
error" (poco frecuente), y el orden elegido ya evita el peor escenario (perder el vehículo sin
haber limpiado nada). Queda anotado como posible mejora futura si el caso de uso crece.

## R6 — Subida de archivos y descarga con URL firmada (bucket privado)

**Decision**: subida vía `client.storage.from('documentos').upload(ruta, archivo, { contentType:
archivo.type })` (sin `upsert`, a diferencia de `logos-empresas`: cada versión de póliza es un
objeto nuevo, nunca se sobreescribe uno existente — research.md del spec ya lo exige). Nombre de
archivo generado por el cliente para evitar colisiones (`{timestamp}-{nombre-original-sanitizado}`
o equivalente). Descarga vía `client.storage.from('documentos').createSignedUrl(ruta, 60)` (60
segundos de vigencia, suficiente para iniciar la descarga) en vez de `getPublicUrl` — el bucket es
privado, una URL pública no funcionaría (devolvería 400/403 sin la firma).

**Rationale**: FR-020 (aislamiento) exige que el bucket sea privado; `getPublicUrl` de un bucket
privado no sirve para nada (Supabase Storage no expone el archivo sin firma). Assumption ya
documentada en `spec.md`.

**Alternatives considered**: proxy de descarga vía `server/api/` que verifique permiso y haga
`createSignedUrl` con `service_role` — rechazado por lo mismo que R5: RLS de `storage.objects` ya
resuelve la autorización sin necesidad de bypass, `createSignedUrl` funciona igual desde el
cliente autenticado normal.

## R7 — Componentes de UI: extender el molde de Catálogos Base, no reusar `useCatalogo` literal

**Decision**: `useCatalogo()` (Catálogos Base) no se reutiliza tal cual para vehículos — su
contrato (`crear`/`editar`/`eliminar` de una sola tabla plana) no modela el alta en dos pasos, la
baja/reactivación, ni el sub-recurso de permisos asignados. Se construye un composable propio
`useVehiculos()` con esa forma específica, pero seguibiendo las mismas convenciones ya
establecidas: mapeo de `23505`→duplicado, `23503`→dependientes, sin capa de servidor intermedia
(R5). `TablaCatalogo.vue` y `DialogoConfirmarEliminarCatalogo.vue` (Catálogos Base) SÍ se
reutilizan tal cual para el listado y el diálogo de confirmación de eliminación — su contrato
genérico (`items`, slots, `etiquetaEntidad`) ya encaja sin cambios.

**Rationale**: forzar el mismo composable genérico a un flujo con pasos adicionales (archivo,
sub-recursos) habría requerido parámetros condicionales que lo vuelven menos legible que tener un
composable propio — la guía del proyecto de no forzar abstracciones que no encajan limpio aplica
aquí. Reutilizar sí lo que genuinamente encaja (la tabla, el diálogo de eliminar) evita
duplicación real.

**Alternatives considered**: extender `useCatalogo` con opciones para "pasos posteriores a crear"
— rechazado, mezclaría dos responsabilidades (CRUD plano vs. flujo con archivo) en una sola
función genérica.

## R8 — Referencias visuales: reutilizables parcialmente, faltan piezas nuevas

**Decision**: `docs/design-references/screens/listado-flotilla.png` ya muestra casi literalmente
lo que pide US-3.2: buscador, columna de placa/modelo, y una columna de estado con badges
"VIGENTE" (verde)/"POR VENCER" (naranja)/"EXPIRADO" (rojo) — coincide con los tokens `success`/
`warning`/`error` ya definidos en `vuetify.config.ts` (research: Stitch no generó estos 3 como
tokens de `design-system.md`, pero si están en `vuetify.config.ts`, con nota de que `success`
salió de la sección "Status Chips" del propio documento). Se usa como referencia directa para
US-3.2, adaptando las columnas a los campos reales (sin "Conductor Asignado": Conductores no
existe todavía) y usando exactamente "vigente"/"por vencer"/"vencida" como estados (no
"expirado"). `detalle-vehiculo.png` sirve de referencia de layout general (paneles de info,
badges) pero **no** cubre el formulario de alta/edición, la pestaña de historial de póliza, ni la
pestaña de permisos asignados — esas 3 piezas no existen todavía como referencia y deben generarse
en Stitch antes de implementarlas (regla de `CLAUDE.md`), igual que Catálogos Base tuvo que hacer
para sus 3 pantallas.

**Rationale**: regla obligatoria de `CLAUDE.md` — no inventar valores de diseño cuando no hay
referencia.

**Alternatives considered**: reutilizar el layout de formulario de Catálogos Base
(`FormularioTipoVehiculo.vue` et al.) sin pasar por Stitch dado que ya es un formulario simple
conocido — parcialmente aceptable para los campos de texto/select, pero el flujo de subida de
archivo (dropzone, dos pasos, dos pestañas del detalle) es nuevo en el proyecto y sí necesita
referencia — se marca como pendiente para `/speckit-tasks`, no se resuelve aquí.
