# Data Model: Historial por Vehículo y Bitácora de Auditoría

> **Fuente de verdad**: todas las tablas involucradas (`cargas_combustible`, `mantenimientos`,
> `checklists`, `servicios_obligatorios`, `asignaciones_conductor_vehiculo`, `auditoria`,
> `usuario_permisos`) ya existen, con su RLS, desde features anteriores — esta feature no crea
> ninguna tabla nueva. La única extensión de esquema es un trigger sobre `usuario_permisos`
> (research.md R1).

## Evento de historial (`EventoHistorial`, tipo de dato en memoria — no una tabla)

| Campo | Tipo | Notas |
|---|---|---|
| `tipo` | `'combustible' \| 'mantenimiento' \| 'checklist' \| 'servicio_obligatorio' \| 'conductor'` | discrimina qué mapeo de ícono/color/resumen aplica (research.md R3) |
| `fecha` | string (date o timestamptz según la fuente) | usada para el orden cronológico |
| `resumen` | string | texto de una línea (research.md R3, FR-002) |
| `icono` | string | nombre de ícono MDI |
| `color` | string | color semántico Vuetify |
| `rutaDetalle` | string \| null | ruta de navegación (FR-003); `null` para el caso "Conductor Asignado", que en su lugar dispara un cambio de pestaña, no una navegación de ruta (research.md R3) |
| `id` | string | id del registro de origen — usado como `key` de lista |

Se construye componiendo las 5 fuentes ya existentes (research.md R2), no una consulta nueva:

- `cargas_combustible` (vía `useCargasCombustible().listar({ vehiculoId })`)
- `mantenimientos` (vía `useMantenimientos().listar({ vehiculoId })`)
- `checklists` (vía `useChecklists().listar({ vehiculoId })`)
- `servicios_obligatorios` (vía `useServiciosObligatorios().listar({ vehiculoId })`)
- `asignaciones_conductor_vehiculo` (vía `useAsignaciones().listarHistorialVehiculo(vehiculoId)`,
  ya existente — research.md R4, un evento por fila, no por inicio/fin)

Cada composable ya aplica su propia RLS/permiso (`tiene_permiso('<módulo>','ver')` o admin) — la
línea de tiempo MUST NOT re-implementar ningún filtro de permiso adicional; hereda el de cada
fuente automáticamente.

## Evento de auditoría (`public.auditoria`, ya existente, sin cambios de columnas)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `usuario_id` | uuid, **nullable**, FK → `usuarios.id` | quién generó el evento. `schema.sql` lo define `not null`, pero `20260806044223_empresas_activo_y_auditoria.sql` lo vuelve nullable a propósito: una escritura hecha con `service_role` (sin sesión de usuario autenticado) no tiene forma de resolver `auth.uid()`, y la fila de auditoría MUST NOT fallar por eso — mejor un `usuario_id` nulo que perder el registro del evento por completo |
| `entidad` | text, not null | nombre de la tabla afectada (`TG_TABLE_NAME`, ej. `'vehiculos'`) — sin FK, es un valor libre que cada trigger de auditoría existente ya escribe |
| `entidad_id` | uuid, not null | id de la fila afectada en esa tabla |
| `accion` | enum `accion_auditoria` (`crear`\|`editar`\|`eliminar`\|`cancelar`\|`desactivar`\|`reactivar`), not null | FR-008; el valor exacto depende de qué trigger dedicado escribió la fila — ver research.md § Assumptions de `spec.md` para el mapeo completo por tabla |
| `valores_antes` | jsonb, nullable | estado completo de la fila antes del cambio; `null` en `crear` |
| `valores_despues` | jsonb, nullable | estado completo de la fila después del cambio; `null` en `eliminar` |
| `created_at` | timestamptz, not null | fecha/hora del evento (FR-008) |

RLS (ya existente, sin cambios — research.md R8):

- `auditoria_select`: `es_superusuario() or (empresa_id = empresa_id() and rol() = 'admin')` — sin
  ninguna acción granular por permiso, a diferencia de las demás tablas de negocio.
- `auditoria_insert`: cualquier usuario autenticado de su propia empresa (los triggers insertan
  con los privilegios de quien ejecuta la operación auditada, no con `service_role`).
- Sin política de `update`/`delete` — un evento de auditoría, una vez insertado, nunca se
  modifica ni se borra (ya garantizado por ausencia de política, `using(false)` implícito por
  RLS habilitada sin política de escritura para esas operaciones).

## Extensión de esta feature: trigger de auditoría sobre `usuario_permisos`

```sql
create or replace function private.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accion public.accion_auditoria;
begin
  if TG_OP = 'INSERT' then
    v_accion := 'crear';
  else
    v_accion := 'eliminar';
  end if;

  insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
  values (
    coalesce(new.empresa_id, old.empresa_id),
    private.actor_id(),
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    v_accion,
    case when TG_OP = 'DELETE' then to_jsonb(old) else null end,
    case when TG_OP = 'INSERT' then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger trg_auditoria_usuario_permisos
  after insert or delete on public.usuario_permisos
  for each row execute function private.registrar_auditoria();
```

Simplificado respecto al `registrar_auditoria()` de `schema_13` original (research.md R1): sin la
rama `TG_OP = 'UPDATE'` (esta tabla no tiene flujo de `UPDATE`, solo alta/baja de permisos, mismo
comentario que ya traía `schema_13`) y sin el caso especial de `'cancelar'` sobre
`cargas_combustible`/`mantenimientos` (no aplica a `usuario_permisos`, y esas dos tablas ya tienen
su propio trigger dedicado que sí lo maneja — research.md R1).

**Dos correcciones encontradas al verificar (T004), respecto al borrador original de este
documento**: (1) `private.actor_id()` — el helper ya establecido que usan todos los demás
triggers de auditoría dedicados del proyecto — reemplaza una consulta manual a `auth.uid()`; a
diferencia de esta última, `actor_id()` tiene un *fallback* explícito para escrituras hechas con
`service_role` (sin sesión de usuario), evitando que `usuario_id` (nullable, ver arriba) rompa
silenciosamente esa ruta. (2) La asignación de `accion` MUST pasar por una variable declarada
`public.accion_auditoria` (`v_accion`), no un `CASE` inline dentro del `INSERT` — Postgres infiere
el tipo de un `CASE` con literales de texto como `text`, no como el enum de la columna destino, y
la escritura falla con `column "accion" is of type public.accion_auditoria but expression is of
type text` (mismo patrón que ya usa `audit_catalogo()`).

## Diff legible (`app/utils/auditoria.ts`, research.md R7)

No es una entidad de datos — una función pura sobre las columnas jsonb ya existentes:

```ts
type CampoDiff = { campo: string; antes: unknown; despues: unknown }
function calcularDiff(antes: Record<string, unknown> | null, despues: Record<string, unknown> | null): CampoDiff[]
```

Excluye `updated_at`/`created_at` de la comparación (FR-009). Si alguno de los dos lados es
`null`, no MUST calcular diff — el llamador (componente de UI) maneja esos dos casos por separado
mostrando el único lado disponible (FR-010).

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature, con exactamente 2 statements (research.md R1):

1. `create or replace function private.registrar_auditoria() ...` (versión simplificada arriba,
   sin cobertura de las 19 tablas ya auditadas por sus propios triggers).
2. `create trigger trg_auditoria_usuario_permisos after insert or delete on
   public.usuario_permisos for each row execute function private.registrar_auditoria();`

No se modifica ninguna tabla, ninguna política RLS, ni ningún trigger de auditoría ya existente
de features anteriores.
