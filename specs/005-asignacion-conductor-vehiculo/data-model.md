# Data Model: Asignación Conductor-Vehículo

> **Fuente de verdad**: `supabase/migrations/20260809215241_conductores_ajustes.sql` (tabla
> `asignaciones_conductor_vehiculo`, creada por Feature 004) y
> `20260810004737_asignaciones_conductor_vehiculo_permiso_conductores.sql` (RLS ampliada a
> `conductores`) — ambas ya aplicadas, no se recrean aquí. Este documento describe ese estado real
> más las extensiones puntuales que esta feature agrega (resumen al final).

## Asignación Conductor-Vehículo (`public.asignaciones_conductor_vehiculo`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `vehiculo_id` | uuid, not null, FK → `vehiculos.id` (sin cascada) | bloquea la eliminación del vehículo mientras tenga asignaciones (FR-012) |
| `conductor_id` | uuid, not null, FK → `conductores.id` (sin cascada) | bloquea la eliminación del conductor mientras tenga asignaciones (Conductores FR-016) |
| `fecha_inicio` | date, not null, default `current_date` | |
| `fecha_fin` | date, nullable | `null` = asignación activa; se establece a la fecha actual al reemplazar (FR-002/FR-006) o finalizar (FR-008) |
| `asignado_por` | uuid, not null, FK → `usuarios.id` | quién la registró |
| `created_at` | timestamptz, not null, default `now()` | usado para ordenar el historial (más reciente primero) |
| — | `unique index` parcial sobre `vehiculo_id` `where fecha_fin is null` | un vehículo solo puede tener una asignación activa a la vez; ningún equivalente para `conductor_id` (un conductor sí puede tener varias asignaciones activas en paralelo, por diseño — FR-003) |

**Extensión de esta feature**: se agrega el trigger de auditoría `AFTER INSERT OR UPDATE OR DELETE`
reutilizando `private.audit_catalogo()` — sin función nueva (research.md R2). No se agregan
columnas.

**Transiciones**: `fecha_fin: null → fecha` (cerrar, vía reemplazo o finalización, ambas un mismo
`UPDATE`). No hay transición inversa: una asignación cerrada no se reabre, se crea una fila nueva
si se vuelve a asignar el mismo par vehículo-conductor.

RLS (ya existente, sin cambios de esta feature — research.md R1): `select`/`write` (`for all`)
condicionados a `tiene_permiso('vehiculos', 'ver'|'editar')` **o** `tiene_permiso('conductores',
'ver'|'editar')` (o admin/superusuario).

## Vista de aplicación: "conductor activo" y "vehículos activos"

No son columnas ni vistas de base de datos — se derivan en cada consulta:

- **Conductor activo de un vehículo** (FR-004): la fila de `asignaciones_conductor_vehiculo` con
  ese `vehiculo_id` y `fecha_fin is null` — a lo sumo una, por el índice único parcial.
- **Vehículos activos de un conductor** (FR-007): todas las filas con ese `conductor_id` y
  `fecha_fin is null` — puede haber varias.
- **Vehículos sin conductor activo** (FR-013): vehículos de la empresa cuyo `id` no aparece entre
  los `vehiculo_id` con `fecha_fin is null` en `asignaciones_conductor_vehiculo` — research.md R5
  sobre por qué se resuelve con una segunda consulta, no un embed de PostgREST.

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature debe agregar:

1. Trigger `AFTER INSERT OR UPDATE OR DELETE` en `asignaciones_conductor_vehiculo`, reutilizando
   `private.audit_catalogo()` ya existente (research.md R2).

Además, un cambio de aplicación (no de esquema) fuera de esa migración:

2. Agregar `asignaciones_conductor_vehiculo: 'asignaciones'` a `ETIQUETAS_DEPENDIENTES` en
   `app/composables/useVehiculos.ts` (research.md R3, FR-012) — una línea, mismo diccionario que
   ya usa `useConductores.ts`.

No se modifican columnas ni RLS de `asignaciones_conductor_vehiculo`, ni ninguna tabla de
Vehículos/Conductores más allá del punto 2 — todo lo demás para esta feature ya está en
producción local desde Feature 004.
