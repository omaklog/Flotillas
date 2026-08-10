# Data Model: Foto del Conductor

> **Fuente de verdad**: `supabase/migrations/20260806044218_initial_schema.sql` (tabla
> `conductores`, `archivos`) y `20260809215241_conductores_ajustes.sql` (RLS de `storage.objects`
> generalizada, sección 3) — ya aplicadas. Este documento describe ese estado real más las
> extensiones puntuales que esta feature agrega (resumen al final).

## Conductor (`public.conductores`)

**Extensión de esta feature**: se agrega `foto_archivo_id uuid, nullable, FK → archivos.id` —
mismo criterio que `vehiculos.foto_archivo_id` (Feature 003): apunta a la foto vigente; `null` si
nunca se adjuntó una. Sin historial (a diferencia de `licencia_archivo_id`, que sí lo conserva).

RLS: sin cambios — `conductores_select`/`conductores_write` ya existentes cubren esta columna
como cualquier otra del registro.

## Archivo de foto de conductor (`public.archivos`, `tipo = 'foto_conductor'`, `entidad_tipo = 'conductor'`)

Misma tabla que ya usan Vehículos (`tipo = 'poliza'|'foto'`) y Conductores (`tipo = 'licencia'`) —
sin columnas nuevas.

| Campo | Tipo | Notas |
|---|---|---|
| `tipo` | enum `tipo_archivo` | **nuevo valor `foto_conductor`** (research.md R2) — `alter type ... add value`, misma restricción de transacción que Vehículos ya resolvió para `'foto'` (no se puede insertar una fila con el valor nuevo en la misma migración que lo agrega) |
| `storage_path` | text, not null | `foto_conductor/{empresa_id}/{conductor_id}/{archivo}` (research.md R2) |
| `entidad_tipo` | text, not null | siempre `'conductor'` para esta feature |
| `entidad_id` | uuid, not null | id del conductor — no es una FK real (columna polimórfica genérica) |

**"Vigente" no es un campo de esta tabla**: se deriva de `conductores.foto_archivo_id =
archivos.id`, mismo criterio que el resto de los archivos del proyecto.

**Sin historial**: a diferencia de la licencia, no hay restricción especial de unicidad, pero la
aplicación garantiza que solo exista una fila `tipo='foto_conductor'` "viva" por conductor en un
momento dado — cada reemplazo borra la fila anterior (research.md R3).

## Storage: bucket `documentos`, políticas generalizadas de nuevo

El bucket ya existe (Vehículos, 003) y sus políticas ya fueron generalizadas una vez (Conductores,
004, research.md R4 de esa feature). Esta feature las **reemplaza otra vez** (drop + create) para
agregar un tercer segmento:

| Segmento `[1]` de la ruta (`{tipo}`) | Permiso requerido |
|---|---|
| `poliza`, `foto` | `tiene_permiso('vehiculos', 'ver'\|'editar')` |
| `licencia` | `tiene_permiso('conductores', 'ver'\|'editar')` |
| `foto_conductor` (**nuevo**) | `tiene_permiso('conductores', 'ver'\|'editar')` |

El segmento `[2]` (aislamiento por empresa) no cambia.

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature debe agregar:

1. `alter type public.tipo_archivo add value 'foto_conductor'` — en su propia transacción, sin
   ninguna manipulación de datos que use el valor nuevo en la misma migración (research.md R2).
2. `alter table public.conductores add column foto_archivo_id uuid references public.archivos(id)`.
3. `drop policy` + `create policy` de las 4 políticas `documentos_select`/`insert`/`update`/`delete`
   de `storage.objects`, agregando la rama `foto_conductor` → `conductores` (research.md R2).

No se modifican columnas existentes de `conductores`/`archivos`, ni la RLS de esas tablas más allá
de lo listado en (3).
