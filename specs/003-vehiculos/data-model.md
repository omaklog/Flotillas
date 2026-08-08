# Data Model: Vehículos

> **Fuente de verdad**: `supabase/migrations/20260806044218_initial_schema.sql` (tablas
> `vehiculos`, `vehiculo_permisos`, `archivos`), `20260806044220_modulos_y_permisos.sql` +
> `20260806044221_permisos_ver_y_defaults.sql` (RLS granular), y
> `20260807184333_placa_vehiculo_obligatoria.sql` (placa `NOT NULL` + `UNIQUE`) — todas ya
> aplicadas, no se recrean aquí. Este documento describe ese estado real más las extensiones
> puntuales que esta feature agrega (resumen al final).

Las tres tablas viven en PostgreSQL (Supabase), RLS habilitado sin excepción (constitución §2),
aisladas por `empresa_id` (constitución §2). El bucket de Storage `documentos` sigue el mismo
aislamiento vía la ruta de sus objetos.

## Vehículo (`public.vehiculos`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `marca` | text, not null | |
| `modelo` | text, not null | |
| `placa` | text, not null | `UNIQUE (empresa_id, placa)` — ya aplicado (T-previo a esta feature) |
| `color`, `numero_serie`, `numero_motor` | text, nullable | |
| `capacidad_carga` | numeric, nullable | |
| `anio` | int, nullable | |
| `numero_ejes` | int, nullable | |
| `tipo_vehiculo_id` | uuid, not null, FK → `tipos_vehiculo.id` | catálogo de Catálogos Base (002) |
| `aseguradora_id` | uuid, nullable, FK → `aseguradoras.id` | catálogo de Catálogos Base (002) |
| `numero_poliza` | text, nullable | |
| `fecha_vencimiento_poliza` | date, nullable | usado para el badge vigente/por vencer/vencida (FR-008) |
| `poliza_archivo_id` | uuid, nullable, FK → `archivos.id` | apunta a la versión vigente; `null` si nunca se adjuntó una |
| `foto_archivo_id` | uuid, nullable, FK → `archivos.id` | **nueva (US-3.7, migración `20260808201217_vehiculos_foto.sql`)** — apunta a la foto vigente del vehículo; a diferencia de `poliza_archivo_id`, SIN historial: cada reemplazo borra la fila/objeto anterior en el mismo momento (FR-024), no solo al eliminar el vehículo |
| `baja` | boolean, not null, default `false` | `true` = dado de baja (FR-012/013/014) |
| `motivo_baja` | text, check `char_length <= 150` | obligatorio al dar de baja (FR-012); se conserva al reactivar |
| `created_at`, `updated_at` | timestamptz | trigger `set_updated_at` ya existe |

**Extensión de esta feature**: se agrega el trigger de auditoría `private.audit_vehiculos()`
(research.md R4), que interpreta cambios en `baja` como `'desactivar'`/`'reactivar'` en vez de
`'editar'`; y, en una ronda posterior de `/speckit-clarify` (sesión 2026-08-08), la columna
`foto_archivo_id` (arriba).

**Transiciones**: `baja: false ⇄ true` (US-3.4, vía `private.audit_vehiculos()` — mismo patrón que
`activo` en empresas/usuarios pero invertido). Eliminación física (US-3.5) sujeta a que no existan
filas dependientes en `cargas_combustible`/`mantenimientos`/`checklists`/`servicios_obligatorios`
(FK sin `ON DELETE CASCADE`, ya así desde `initial_schema.sql`); al eliminar, esta feature además
borra explícitamente sus filas de `archivos` y los objetos de Storage correspondientes (FR-016a,
Clarifications sesión 2026-08-08 — ver research.md R5 para el orden de los pasos).

RLS (ya existente, sin cambios): `vehiculos_select` para cualquier usuario de la empresa con
`tiene_permiso('vehiculos','ver')` (o admin/superusuario); `vehiculos_write` (INSERT/UPDATE/DELETE
combinados) para `tiene_permiso('vehiculos','editar')` (o admin/superusuario) — ver research.md R1
sobre por qué `'crear'`/`'eliminar'` del módulo no bastan por sí solos.

## Archivo de póliza (`public.archivos`, `tipo = 'poliza'`, `entidad_tipo = 'vehiculo'`)

> La misma tabla también almacena las fotos de vehículo con `tipo = 'foto'` (US-3.7) — ver nota
> al final de esta sección.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `tipo` | enum `tipo_archivo` (`poliza`\|`licencia`\|`factura`\|`foto`) | `'poliza'` o `'foto'` para esta feature; `'foto'` agregado en la migración `20260808201217_vehiculos_foto.sql` (US-3.7) |
| `storage_path` | text, not null | `poliza/{empresa_id}/{vehiculo_id}/{archivo}` (research.md R3) |
| `entidad_tipo` | text, not null | siempre `'vehiculo'` para esta feature |
| `entidad_id` | uuid, not null | id del vehículo — **no es una FK real** (columna polimórfica genérica, compartida con futuras entidades como conductores); ver FR-016a sobre las implicaciones al eliminar |
| `subido_por` | uuid, not null, FK → `usuarios.id` | quién subió esa versión (US-3.3, historial) |
| `created_at` | timestamptz, not null, default `now()` | usado para ordenar el historial de versiones (más reciente primero) |

**Extensión de esta feature**: ninguna columna nueva. Se agrega el trigger de auditoría
`AFTER INSERT OR UPDATE OR DELETE` reusando `private.audit_catalogo()` (ya existe desde Catálogos
Base — research.md R4).

**"Vigente" no es un campo de esta tabla**: se deriva de `vehiculos.poliza_archivo_id = archivos.id`
en el momento de la consulta — evita una segunda fuente de verdad que pueda desincronizarse (mismo
razonamiento que Feature 001 aplicó al estado "invitado" de un usuario).

**Múltiples versiones por vehículo**: no hay restricción de unicidad sobre
`(entidad_tipo, entidad_id)` — un vehículo puede (y va a, con el tiempo) tener varias filas de
`archivos` con `tipo='poliza'`. El historial de versiones (US-3.3) es exactamente:
`select * from archivos where entidad_tipo='vehiculo' and entidad_id=:vehiculoId and
tipo='poliza' order by created_at desc`.

RLS (ya existente, sin cambios): `archivos_select`/`archivos_insert` para cualquier usuario de la
empresa; `archivos_delete` restringido a admin (o, tras esta feature, a
`tiene_permiso('vehiculos','editar')` si se decide extenderla — ver Nota abajo). No existe
política de `UPDATE`: los archivos nunca se editan, solo se crean nuevas versiones.

> **Nota para `/speckit-plan` → `/speckit-tasks`**: `archivos_delete` hoy exige `rol = 'admin'`
> a secas (no `tiene_permiso`), definida en `initial_schema.sql`. Esta feature necesita que un
> operario con `tiene_permiso('vehiculos','editar')` también pueda disparar la limpieza de
> archivos al eliminar un vehículo (FR-016a) o al reemplazar una póliza — igual que ya puede
> editar el vehículo mismo. Se ajusta esa política como parte de la migración de esta feature.

**Foto del vehículo, sin historial (US-3.7)**: mismas columnas de arriba, con `tipo = 'foto'` y
`vehiculos.foto_archivo_id` como puntero a la vigente. A diferencia de la póliza, **no** se
conservan versiones anteriores — cada reemplazo borra la fila y el objeto de Storage anterior en
el mismo momento de la operación (contracts/vehiculos.md, sección "Foto del vehículo"), en vez de
esperar a que se elimine el vehículo completo.

## Asignación de permiso a vehículo (`public.vehiculo_permisos`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `vehiculo_id` | uuid, not null, FK → `vehiculos.id` on delete cascade | única FK de esta feature con cascada — al eliminar un vehículo, sus asignaciones desaparecen solas |
| `permiso_id` | uuid, not null, FK → `permisos.id` | catálogo de Catálogos Base (002) |
| `fecha_vencimiento` | date, nullable | US-3.6 |
| `created_at` | timestamptz, not null, default `now()` | |
| — | `UNIQUE (vehiculo_id, permiso_id)` | ya existe — respaldo de FR-018 (no duplicar asignación) |

**Extensión de esta feature**: se agrega el trigger de auditoría reusando
`private.audit_catalogo()` (research.md R4).

RLS (ya existente, sin cambios): mismo patrón que `vehiculos` — `tiene_permiso('vehiculos','ver')`
para leer, `tiene_permiso('vehiculos','editar')` para escribir.

## Bucket de Storage `documentos`

No es una tabla de `public`, pero forma parte del modelo de datos de esta feature (primera vez
que el proyecto sube archivos que no sean el logo de empresa).

| Propiedad | Valor |
|---|---|
| `id` / `name` | `documentos` |
| `public` | `false` (a diferencia de `logos-empresas`) |
| `file_size_limit` | 10485760 (10 MB) |
| `allowed_mime_types` | `['application/pdf', 'image/jpeg', 'image/png']` |
| Convención de ruta | `{tipo}/{empresa_id}/{entidad_id}/{archivo}` — para esta feature, siempre `poliza/{empresa_id}/{vehiculo_id}/{archivo}` |

RLS de `storage.objects` para este bucket: nueva (research.md R3) — select/insert/update/delete
condicionados a `(storage.foldername(name))[2] = empresa_id` (segundo segmento: el primero es
`{tipo}`) y `tiene_permiso('vehiculos','ver'|'editar')` o admin/superusuario.

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature debe agregar, sobre lo ya aplicado:

1. Bucket `documentos` (privado, 10 MB, PDF/JPG/PNG) + sus 4 políticas de `storage.objects`
   (research.md R3).
2. Función `private.audit_vehiculos()` (interpreta `baja` como `desactivar`/`reactivar`) + trigger
   en `vehiculos` (research.md R4).
3. Triggers `AFTER INSERT OR UPDATE OR DELETE` en `vehiculo_permisos` y `archivos`, reusando
   `private.audit_catalogo()` ya existente desde Catálogos Base (research.md R4).
4. Ajuste de la política `archivos_delete` para aceptar `tiene_permiso('vehiculos','editar')`
   además de `rol = 'admin'` (ver Nota en la sección de `archivos` arriba).

No se modifican columnas existentes de `vehiculos`/`vehiculo_permisos`, ni la RLS de esas dos
tablas, ni los módulos/acciones ya sembrados — todo lo demás para esta feature ya está en
producción local desde Feature 001.

**Nota (US-3.7, `/speckit-clarify` sesión 2026-08-08)**: `app/pages/admin/vehiculos/[id]/index.vue`
(antes `[id].vue`) ya no reusa `FormularioVehiculo.vue` directamente — es una vista de solo
lectura de los mismos campos. El formulario editable vive ahora en
`app/pages/admin/vehiculos/[id]/editar.vue`, ruta hermana (no anidada) gracias a la carpeta
`[id]/` — Nuxt exige `<NuxtPage/>` en el padre si `[id].vue` y `[id]/editar.vue` coexisten como
archivo+carpeta, así que se movió el detalle a `[id]/index.vue` para que ambas rutas sean
independientes. No hay cambios de esquema de base de datos asociados a este ajuste.
