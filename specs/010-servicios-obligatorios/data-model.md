# Data Model: Bitácora de Servicios Obligatorios

> **Fuente de verdad**: `20260806044218_initial_schema.sql` (tabla `servicios_obligatorios`, enum
> `tipo_servicio_obligatorio`, índices), `20260806044220_modulos_y_permisos.sql` +
> `20260806044221_permisos_ver_y_defaults.sql` (RLS granular por permiso, módulo
> `servicios_obligatorios` ya sembrado, `ver` otorgado por defecto a todo operario nuevo) — todas
> ya aplicadas (research.md R1). Este documento describe ese estado real más la única extensión
> que esta feature agrega: `schema_12_tipo_archivo_testigo.sql` + un trigger de auditoría
> (research.md R1, R3).

## Servicio obligatorio (`public.servicios_obligatorios`, ya existente, sin cambios de columnas)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `vehiculo_id` | uuid, not null, FK → `vehiculos.id` | FR-002 — el selector del formulario excluye vehículos dados de baja (filtro de aplicación, no `CHECK` de BD, mismo criterio que Combustible/Mantenimiento/Checklist) |
| `tipo` | enum `tipo_servicio_obligatorio` (`revision_fisico_mecanica`\|`verificacion_ambiental`\|`renovacion_aditamentos`), not null | FR-001 — catálogo fijo, igual para todas las empresas (no hay tabla ni pantalla de administración de este catálogo) |
| `fecha_realizado` | date, not null | FR-003 — MUST NOT ser posterior a hoy (validación de cliente; sin `CHECK` a nivel de BD, mismo criterio que otros campos condicionales del proyecto) |
| `fecha_vencimiento` | date, not null | FR-004 — MUST ser posterior a `fecha_realizado` (validación de cliente) |
| `archivo_id` | uuid, nullable, FK → `archivos.id` | comprobante/certificado, opcional (FR-005); sin historial de versiones — un único puntero que se reemplaza (research.md R4) |
| `created_at` | timestamptz, not null | |
| `updated_at` | timestamptz, not null | ya tiene su trigger `trg_servicios_obligatorios_updated_at` (`private.set_updated_at()`), sin cambios |

**No es inmutable**: a diferencia de Checklist/Combustible/Mantenimiento, no hay ninguna política
`using (false)` sobre `UPDATE`/`DELETE` — es editable y eliminable libremente por quien tenga el
permiso correspondiente (FR-006, FR-007). No existe ninguna tabla que referencie
`servicios_obligatorios.id`, por lo que eliminar una fila nunca queda bloqueado por dependientes
(FR-007, SC-005).

**Vigencia**: no se almacena — se calcula en el cliente a partir de `fecha_vencimiento` respecto a
hoy (FR-009, research.md R7): `vencido` si ya pasó, `por_vencer` si vence dentro de 60 días,
`vigente` en cualquier otro caso.

RLS (ya aplicada, sin cambios — research.md R1, R2):

- `servicios_obligatorios_select`: `tiene_permiso('servicios_obligatorios','ver')` (o
  admin/superusuario) — **otorgado por defecto** a todo operario nuevo
  (`private.otorgar_permisos_default_operario()`, `modulos_ver`).
- `servicios_obligatorios_write` (`for all` — cubre insert/update/delete):
  `tiene_permiso('servicios_obligatorios','editar')` (o admin/superusuario) — **no** otorgado por
  defecto. **research.md R2, importante**: `acciones_disponibles` también lista `'crear'` y
  `'eliminar'` como acciones seleccionables para este módulo, pero ninguna política las
  referencia — la única acción con efecto real en RLS es `'editar'`. La UI MUST gatear registrar/
  editar/eliminar con `tienePermiso('servicios_obligatorios','editar')`.

## Tipo de archivo `testigo_servicio` (extensión del enum `tipo_archivo`)

`docs/schema-reference/schema_12_tipo_archivo_testigo.sql` agrega el valor `'testigo_servicio'`
al enum `public.tipo_archivo` — el mismo enum ya usado por `poliza`, `licencia`, `factura`,
`foto`, `foto_conductor`, `testigo_servicio` (checklist no usa archivos). Sin cambios a la tabla
`archivos` en sí: un servicio obligatorio sube su comprobante con
`tipo = 'testigo_servicio'`, `entidad_tipo = 'servicio_obligatorio'`, `entidad_id = <id de la fila
de servicios_obligatorios>` — mismo patrón ya usado por póliza/facturas/fotos. `entidad_tipo =
'servicio_obligatorio'` ya está documentado como valor esperado en el comentario de la columna
desde el esquema inicial (`schema.sql`, tabla `archivos`).

**Nota sobre `ALTER TYPE ... ADD VALUE`** (ya aplicada como lección en 007/008/009): no puede
usarse en la misma transacción en la que ese valor se inserta por primera vez — la migración de
esta feature se limita al `ALTER TYPE` y al trigger de auditoría (ninguno de los dos inserta una
fila con `'testigo_servicio'`), sin riesgo de violar esa regla.

## Auditoría (research.md R3, gap encontrado — nuevo trigger de esta feature)

`servicios_obligatorios` no tiene ningún trigger de auditoría aplicado todavía. Esta feature
agrega uno, reutilizando la función genérica ya existente (mismo criterio que Checklist,
research.md R1 de 009 — sin necesidad de una función dedicada, ya que no hay una columna de
estado que distinguir):

```sql
create trigger trg_servicios_obligatorios_auditoria
  after insert or update or delete on public.servicios_obligatorios
  for each row execute function private.audit_catalogo();
```

Mapea `INSERT → 'crear'`, `UPDATE → 'editar'`, `DELETE → 'eliminar'` — exactamente las 3
transiciones que esta feature permite (FR-001, FR-006, FR-007).

## Comprobante del servicio (relación con `public.archivos`, ya existente, sin cambios)

No es una entidad nueva — se apoya en `archivos` (Combustible/Mantenimiento/Vehículos ya la usan
igual). Consulta para listar/ver el comprobante vigente de un servicio:

```sql
select * from public.archivos
where entidad_tipo = 'servicio_obligatorio' and entidad_id = ? and tipo = 'testigo_servicio'
```

Como máximo una fila relevante en todo momento (research.md R4, sin historial) — a diferencia de
`listarHistorialPoliza`/`listarHistorialFactura`, no hace falta ordenar por `created_at` ni
mostrar una lista; basta con `.maybeSingle()`.

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature:

1. `alter type public.tipo_archivo add value 'testigo_servicio';` (contenido literal de
   `schema_12_tipo_archivo_testigo.sql`, research.md R1).
2. `create trigger trg_servicios_obligatorios_auditoria after insert or update or delete on
   public.servicios_obligatorios for each row execute function private.audit_catalogo();`
   (research.md R3 — **nueva respecto a `schema_12`**, gap encontrado durante planning).

No se modifica ninguna política RLS, ninguna tabla, ni el catálogo de módulos/acciones — todo lo
demás para esta feature ya está en producción local desde `20260806044218_initial_schema.sql` y
sus dos migraciones de permisos inmediatas siguientes.
