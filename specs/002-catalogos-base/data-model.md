# Data Model: Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos)

> **Fuente de verdad**: `supabase/migrations/20260806044218_initial_schema.sql` (tablas),
> `20260806044220_modulos_y_permisos.sql` y `20260806044221_permisos_ver_y_defaults.sql` (módulos,
> acciones y RLS granular) — ya aplicadas, no se recrean aquí. Este documento describe ese estado
> real más las extensiones puntuales que esta feature agrega (ver "Extensiones" en cada entidad y
> el resumen al final).

Las tres tablas viven en PostgreSQL (Supabase), RLS habilitado sin excepción (constitución §2),
aisladas por `empresa_id` (constitución §2, spec FR-014).

## TipoVehiculo (`public.tipos_vehiculo`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `clave` | text, not null | `UNIQUE (empresa_id, clave)` ya existe |
| `nombre` | text, not null | |
| `created_at` | timestamptz, not null, default `now()` | sin `updated_at` en el esquema actual (ver Extensiones) |

**Extensión de esta feature**: `CHECK (clave ~ '^[a-z0-9_]+$' AND char_length(clave) <= 50)`
(spec FR-005; research.md R2) y columna `updated_at timestamptz not null default now()` +
trigger `set_updated_at` (falta hoy; el resto de catálogos del esquema sí la tiene — se agrega
por consistencia, ya que FR-008 permite editar).

**Referenciado por**: `vehiculos.tipo_vehiculo_id` (`not null`, sin `ON DELETE CASCADE` ⇒
bloquea `DELETE` mientras exista al menos un vehículo con ese tipo) y `checklists.tipo_vehiculo_id`.

**Siembra automática**: al insertar una fila en `empresas`, el trigger
`trg_empresas_sembrar_tipos_vehiculo` (research.md R3, nuevo en esta feature) inserta 3 filas:

| `clave` | `nombre` |
|---|---|
| `ligero` | Vehículo ligero |
| `pesado` | Servicio pesado (más de 3.5 toneladas) |
| `mat_peligrosos` | Transporte de materiales peligrosos |

RLS (ya existente): `select` para cualquier usuario de la empresa (o con permiso granular `ver`
del módulo `tipos_vehiculo`); `insert/update/delete` para `admin` de la empresa (o con permiso
granular `crear`/`editar`/`eliminar` del mismo módulo) o `superusuario`.

## Aseguradora (`public.aseguradoras`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `razon_social` | text, not null | |
| `rfc` | text, not null | sin `CHECK` de formato (research.md — Assumptions del spec: texto libre, ver nota abajo) |
| `created_at`, `updated_at` | timestamptz | trigger `set_updated_at` ya existe |

**Extensión de esta feature**: ninguna al esquema — la tabla ya está completa para FR-003. RFC se
captura como texto libre (longitud razonable vía validación de formulario), sin `CHECK` de
formato estricto, según Assumptions de `spec.md`.

**Referenciado por**: `vehiculos.aseguradora_id` (nullable, sin `ON DELETE CASCADE` ⇒ bloquea
`DELETE` mientras exista al menos un vehículo asociado).

RLS (ya existente): mismo patrón que TipoVehiculo, módulo `aseguradoras`.

## TipoPermiso (`public.permisos`)

> Nombre de tabla real: `permisos` (no confundir con `usuario_permisos`, la tabla de permisos
> granulares por operario de la Feature 001 — son entidades distintas que comparten la palabra
> "permiso" porque el dominio de negocio la usa para dos cosas: permisos de circulación de un
> vehículo, y permisos de acceso de un usuario).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `clave` | text, not null | `UNIQUE (empresa_id, clave)` ya existe |
| `nombre` | text, not null | |
| `tipo` | enum `tipo_permiso` (`estatal`\|`federal`), not null | ya existe |
| `created_at` | timestamptz, not null, default `now()` | sin `updated_at` (mismo caso que TipoVehiculo) |

**Extensión de esta feature**: mismo `CHECK` de formato de `clave` que TipoVehiculo (research.md
R2) y misma adición de `updated_at` + trigger `set_updated_at`.

**Referenciado por**: `vehiculo_permisos.permiso_id` (`not null`, sin `ON DELETE CASCADE` ⇒
bloquea `DELETE` mientras exista al menos una asignación vehículo-permiso). La asignación en sí
(`vehiculo_permisos`) es explícitamente **fuera de alcance** de esta feature (spec, "Fuera de
alcance") — vive en Vehículos (003).

RLS (ya existente): mismo patrón, módulo `permisos`.

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature debe agregar, sobre lo ya aplicado:

1. `CHECK` de formato de `clave` en `tipos_vehiculo` y `permisos` (research.md R2).
2. Columna `updated_at` + trigger `set_updated_at` en `tipos_vehiculo` y `permisos` (para que
   FR-008, editar, se comporte igual que en `aseguradoras`).
3. Función `private.sembrar_tipos_vehiculo_default()` + trigger `AFTER INSERT ON public.empresas`
   (research.md R3, FR-011).
4. Función `private.audit_catalogo()` + un trigger `AFTER INSERT OR UPDATE OR DELETE` por cada una
   de las 3 tablas (research.md R4, constitución §2).

No se modifican columnas existentes, RLS existente ni los módulos/acciones ya sembrados — todo lo
demás del esquema para esta feature ya está en producción local desde la Feature 001.
