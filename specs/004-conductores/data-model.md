# Data Model: Conductores

> **Fuente de verdad**: `supabase/migrations/20260806044218_initial_schema.sql` (tabla
> `conductores`, `archivos`), `20260806044220_modulos_y_permisos.sql` +
> `20260806044221_permisos_ver_y_defaults.sql` (RLS granular de `conductores`, ya con
> `tiene_permiso('conductores', ...)`) — todas ya aplicadas, no se recrean aquí. Este documento
> describe ese estado real más las extensiones puntuales que esta feature agrega (resumen al
> final).

Las tablas viven en PostgreSQL (Supabase), RLS habilitado sin excepción (constitución §2),
aisladas por `empresa_id` (constitución §2). El bucket de Storage `documentos` (ya creado por
Vehículos) sigue el mismo aislamiento vía la ruta de sus objetos.

## Conductor (`public.conductores`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `nombre`, `apellidos` | text, not null | |
| `celular` | text, nullable | |
| `calle`, `numero`, `colonia` | text, nullable | domicilio (FR-001) |
| `numero_licencia` | text, not null | **nueva restricción de esta feature**: `UNIQUE (empresa_id, numero_licencia)` (FR-002, research.md R2) |
| `tipo_licencia` | enum `tipo_licencia` (`federal`\|`local`) | |
| `fecha_vencimiento_licencia` | date, not null | usado para el badge vigente/por vencer/vencida (FR-008), mismo umbral de 60 días que Vehículos |
| `licencia_archivo_id` | uuid, nullable, FK → `archivos.id` | apunta a la versión vigente; `null` si nunca se adjuntó una |
| `activo` | boolean, not null, default `true` | semántica NO invertida (a diferencia de `vehiculos.baja`) — mismo criterio que `empresas`/`usuarios` |
| `motivo_baja` | text, check `char_length <= 150` | **nueva columna de esta feature** (research.md R2) — obligatorio al desactivar (FR-012); se conserva al reactivar |
| `created_at`, `updated_at` | timestamptz | trigger `set_updated_at` ya existe |

**Extensión de esta feature**: se agrega la columna `motivo_baja` y la restricción
`UNIQUE(empresa_id, numero_licencia)` (research.md R2), y el trigger de auditoría reutilizando
`private.audit_empresas_usuarios()` — **sin** crear una función nueva, a diferencia de Vehículos
(research.md R3).

**Transiciones**: `activo: true ⇄ false` (US-5, vía `private.audit_empresas_usuarios()` — mismo
patrón que `activo` en `empresas`/`usuarios`, sin invertir como `vehiculos.baja`). Eliminación
física (US-6) sujeta a que no existan filas dependientes en `asignaciones_conductor_vehiculo`
(FK sin `ON DELETE CASCADE`, tabla creada por esta misma feature — research.md R6); al eliminar,
esta feature además borra explícitamente sus filas de `archivos` y los objetos de Storage
correspondientes (FR-016a, mismo patrón que Vehículos).

RLS (ya existente, sin cambios — research.md R1): `conductores_select` para cualquier usuario de
la empresa con `tiene_permiso('conductores','ver')` (o admin/superusuario); `conductores_write`
(INSERT/UPDATE/DELETE combinados) para `tiene_permiso('conductores','editar')` (o
admin/superusuario) — mismo matiz que Vehículos: `'crear'`/`'eliminar'` del módulo no bastan por
sí solos a nivel de RLS, solo `'editar'`.

## Archivo de licencia (`public.archivos`, `tipo = 'licencia'`, `entidad_tipo = 'conductor'`)

La misma tabla que ya usa Vehículos para pólizas y fotos (`tipo = 'poliza'`/`'foto'`) — sin
columnas nuevas, sin cambios de estructura.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `tipo` | enum `tipo_archivo` (`poliza`\|`licencia`\|`factura`\|`foto`) | `'licencia'` para esta feature — valor ya existente en el enum desde `initial_schema.sql`, sin `ALTER TYPE` necesario |
| `storage_path` | text, not null | `licencia/{empresa_id}/{conductor_id}/{archivo}` |
| `entidad_tipo` | text, not null | siempre `'conductor'` para esta feature — valor ya anticipado en el comentario original de la columna (`initial_schema.sql`) |
| `entidad_id` | uuid, not null | id del conductor — no es una FK real (columna polimórfica genérica, compartida con Vehículos); ver FR-016a sobre las implicaciones al eliminar |
| `subido_por` | uuid, not null, FK → `usuarios.id` | quién subió esa versión (US-4, historial) |
| `created_at` | timestamptz, not null, default `now()` | usado para ordenar el historial de versiones (más reciente primero) |

**"Vigente" no es un campo de esta tabla**: se deriva de `conductores.licencia_archivo_id =
archivos.id` en el momento de la consulta — mismo criterio que Vehículos y, antes, el estado
"invitado" de un usuario (Feature 001).

**Múltiples versiones por conductor**: igual que la póliza — sin restricción de unicidad sobre
`(entidad_tipo, entidad_id)`. El historial de versiones (US-4) es exactamente:
`select * from archivos where entidad_tipo='conductor' and entidad_id=:conductorId and
tipo='licencia' order by created_at desc`.

RLS: `archivos_select`/`archivos_insert` ya son genéricos para cualquier usuario de la empresa
(sin cambios). `archivos_delete` **se ajusta en esta feature** (research.md R5) para aceptar
también `tiene_permiso('conductores','editar')`, además de `tiene_permiso('vehiculos','editar')`
(ya agregado por Vehículos) y `rol = 'admin'`. No existe política de `UPDATE`: los archivos nunca
se editan, solo se crean nuevas versiones.

## Asignación de conductor a vehículo (`public.asignaciones_conductor_vehiculo`)

**Nueva en esta feature** (Clarifications, sesión 2026-08-09 — research.md R6): se crea la tabla
tal cual está prediseñada en
`docs/schema-reference/schema_06_asignaciones_conductor_vehiculo.sql`, sin modificarla. Esta
feature **no construye ninguna UI** sobre esta tabla — existe únicamente para que la eliminación
de un conductor con asignaciones (FR-015/FR-016) sea rechazable y probable de punta a punta desde
ahora. La UI de asignación (crear, listar, cerrar una asignación) es alcance exclusivo de Feature
005.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `vehiculo_id` | uuid, not null, FK → `vehiculos.id` (sin cascada) | |
| `conductor_id` | uuid, not null, FK → `conductores.id` (sin cascada) | **la que bloquea la eliminación de un conductor (FR-015/FR-016)** |
| `fecha_inicio` | date, not null, default `current_date` | |
| `fecha_fin` | date, nullable | `null` = asignación activa |
| `asignado_por` | uuid, not null, FK → `usuarios.id` | |
| `created_at` | timestamptz, not null, default `now()` | |
| — | `unique index` parcial sobre `vehiculo_id` `where fecha_fin is null` | un vehículo solo puede tener una asignación activa a la vez; ningún equivalente para `conductor_id` (un conductor sí puede tener varias asignaciones activas en paralelo, por diseño de esa migración) |

RLS (ya definida en la migración pre-diseñada, sin cambios de esta feature): `select`/`write`
condicionados a `tiene_permiso('vehiculos', 'ver'|'editar')` (o admin/superusuario) — no
`conductores`, porque esa migración ya decidió que la asignación se gestiona desde el detalle del
*vehículo* (decisión que pertenece a Feature 005, no revisada ni cuestionada aquí).

## Bucket de Storage `documentos`

Ya existe (creado por Vehículos, `20260808174129_vehiculos_storage_auditoria.sql`) — esta feature
no lo vuelve a crear, pero **reemplaza sus 4 políticas de `storage.objects`** (research.md R4).

| Propiedad | Valor |
|---|---|
| `id` / `name` | `documentos` |
| `public` | `false` |
| `file_size_limit` | 10485760 (10 MB) |
| `allowed_mime_types` | `['application/pdf', 'image/jpeg', 'image/png']` |
| Convención de ruta | `{tipo}/{empresa_id}/{entidad_id}/{archivo}` — para esta feature, siempre `licencia/{empresa_id}/{conductor_id}/{archivo}` |

RLS de `storage.objects` (research.md R4 — **modificada** por esta feature, no creada desde cero):
select/insert/update/delete condicionados a `(storage.foldername(name))[2] = empresa_id` (segundo
segmento, sin cambio) **y** al permiso correspondiente según el primer segmento (`{tipo}`):
`tiene_permiso('vehiculos', 'ver'|'editar')` si es `poliza`/`foto`, `tiene_permiso('conductores',
'ver'|'editar')` si es `licencia` — o `rol='admin'`/`es_superusuario()` en cualquier caso.

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature debe agregar, sobre lo ya aplicado:

1. Columna `motivo_baja` (con su `check`) y restricción `UNIQUE(empresa_id, numero_licencia)` en
   `conductores` (research.md R2).
2. Trigger `AFTER INSERT OR UPDATE OR DELETE` en `conductores`, reutilizando
   `private.audit_empresas_usuarios()` ya existente — sin función nueva (research.md R3).
3. `drop`/`create` de las 4 políticas `documentos_select`/`insert`/`update`/`delete` de
   `storage.objects`, generalizadas por segmento de ruta `{tipo}` (research.md R4).
4. Ajuste de la política `archivos_delete` para agregar `tiene_permiso('conductores','editar')`
   al `OR` ya existente (research.md R5).
5. La tabla `asignaciones_conductor_vehiculo` completa, tal cual
   `docs/schema-reference/schema_06_asignaciones_conductor_vehiculo.sql` (research.md R6) — sin
   modificaciones.

No se modifican columnas existentes de `conductores` más allá de lo listado en (1), ni la RLS de
esa tabla, ni los módulos/acciones ya sembrados — todo lo demás para esta feature ya está en
producción local desde Feature 001.
