# Data Model: Autenticación, Configuración Inicial, Usuarios y Permisos

> **Fuente de verdad**: `docs/schema-reference/schema.sql`, `schema_02_permisos.sql`,
> `schema_03_ver_y_defaults.sql` y `schema_04_indices.sql` (diseñados y revisados por el usuario
> en una sesión previa). Este documento describe esas migraciones tal cual, más las extensiones
> puntuales que esta feature necesita y que el propio `schema.sql` no cubre todavía (ver
> "Extensiones sobre schema.sql" al final). No se reinterpreta el modelo de permisos original —
> se documenta como está.

Todas las tablas viven en PostgreSQL (Supabase), RLS habilitado sin excepción (constitución §2).
`usuarios.auth_user_id` referencia `auth.users.id` (uno a uno con Supabase Auth) — no se duplica
gestión de contraseñas fuera de Supabase Auth.

## Empresa

Tenant del sistema (`schema.sql` §2).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `nombre` | text, not null | |
| `rfc` | text, not null | |
| `telefono_oficina_1`, `telefono_oficina_2`, `telefono_movil` | text, nullable | |
| `correo` | text, nullable | |
| `logo_url` | text, nullable | opcional en el alta (US1) |
| `unidad_distancia` | enum `unidad_distancia` (`km`\|`millas`), default `km` | |
| `unidad_combustible` | enum `unidad_combustible` (`litros`\|`galones`), default `litros` | |
| `pais` | text, default `México` | |
| `moneda` | text, default `MXN` | |
| `created_at`, `updated_at` | timestamptz | trigger `set_updated_at` |

**Extensión de esta feature (no está en `schema.sql` v1)**: columna `activo boolean not null
default true` — necesaria para FR-006/007/008 (US7: desactivar empresa sin eliminar datos, y
bloquear login de sus usuarios). Se agrega en una migración propia de esta feature, después de
aplicar `schema.sql` tal cual. Nombrada `activo` (no `estado` texto) para seguir la misma
convención que `usuarios.activo` en el esquema real.

**Transiciones**: `activo: true ⇄ false` (US7). Nunca se borra una empresa desde esta feature.

RLS (`schema.sql`): superusuario ve/crea/borra todas; un usuario ve/edita solo la suya (edición
limitada a `rol = 'admin'`).

## Usuario

Perfil ligado a `auth.users` (`schema.sql` §3). **Un usuario pertenece a una sola empresa**
(excepto superusuario, `empresa_id null`) — a diferencia de mi borrador anterior de este
documento, aquí no existe una columna `estado` con valores de texto tipo "invitado".

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `auth_user_id` | uuid, not null, unique, FK → `auth.users.id` on delete cascade | |
| `empresa_id` | uuid, FK → `empresas.id` on delete cascade, nullable | `null` solo si `rol = 'superusuario'` (constraint `chk_superusuario_sin_empresa`) |
| `nombre` | text, not null | |
| `correo` | text, not null | |
| `rol` | enum `rol_usuario` (`superusuario`\|`admin`\|`operario`), default `operario` | |
| `activo` | boolean, not null, default true | `false` = desactivado/revocado (mismo campo para admin y operario — un admin "revocado" y un operario "desactivado" son el mismo `activo = false`) |
| `created_at`, `updated_at` | timestamptz | trigger `set_updated_at` |

**Estado "invitado" (no es una columna)**: se deriva de los campos nativos de `auth.users`
(`invited_at` no nulo, `email_confirmed_at` nulo ⇒ "Pendiente" en la UI). No se duplica ese
estado en `public.usuarios` — evita una segunda fuente de verdad que pueda desincronizarse
(mismo razonamiento que `research.md` R9, ahora confirmado por el propio `schema.sql`, que
tampoco tiene esa columna).

**Transiciones**:
- Aceptar invitación → Supabase Auth marca `email_confirmed_at`; no cambia ninguna columna de
  `public.usuarios` (ya nace con `activo = true`).
- `activo: true ⇄ false`: desactivar/reactivar/revocar (US2 empresa completa vía su propio
  `activo`, US8 admin, US9 operario).
- Eliminación física: solo si no tiene operaciones registradas (US9, FR-024) — se valida en
  `server/api/`, no es expresable en RLS puro (ver comentario en `schema.sql` línea 180-181).

RLS (`schema.sql`): un usuario ve su propia fila, el admin ve/edita las de su empresa, el
superusuario ve todo.

## Módulo (`modulos`)

Catálogo global fijo, ya seedeado en `schema_02_permisos.sql` — **las 16 filas ya están
definidas, no quedan por definir** (esto resuelve el hallazgo G1 del análisis anterior):

| `clave` | `nombre` | `orden` |
|---|---|---|
| `configuracion` | Configuración | 1 |
| `usuarios` | Usuarios | 2 |
| `vehiculos` | Vehículos | 3 |
| `conductores` | Conductores | 4 |
| `proveedores` | Proveedores | 5 |
| `aseguradoras` | Compañías de Seguro | 6 |
| `permisos` | Catálogo de Permisos | 7 |
| `tipos_vehiculo` | Tipos de Vehículo | 8 |
| `productos` | Catálogo de Productos | 9 |
| `combustible` | Carga de Combustible | 10 |
| `mantenimiento` | Mantenimiento Correctivo y Preventivo | 11 |
| `checklist` | Checklist de Seguridad | 12 |
| `servicios_obligatorios` | Bitácora de Servicios Obligatorios | 13 |
| `reportes` | Reportes | 14 |
| `alertas` | Alertas | 15 |
| `archivos` | Archivos | 16 |

PK es `clave` (text), no un `uuid` — a diferencia de mi borrador anterior.

## Acción disponible (`acciones_disponibles`)

Catálogo de qué acciones aplica cada módulo (`schema_02_permisos.sql`), PK compuesta
(`modulo_clave`, `accion`). Ya seedeado con nombres visibles; ejemplos relevantes a esta feature:

- `usuarios`: `ver`, `crear`, `editar`, `eliminar`.
- `configuracion`: `ver`, `editar`.
- `combustible` / `mantenimiento`: `ver`, `crear`, `cancelar` — **sin** `editar`/`eliminar`
  (consistente con constitución §2: son inmutables, solo cancelables).
- `checklist`: `ver`, `crear` (sin editar/eliminar/cancelar).
- `archivos`: `ver`, `crear`, `eliminar`.
- `reportes`: `ver`, `exportar`.
- `alertas`: `ver`, `aprobar`.
- Catálogos generales (`vehiculos`, `conductores`, `proveedores`, `aseguradoras`, `permisos`,
  `tipos_vehiculo`, `productos`, `servicios_obligatorios`): `ver`, `crear`, `editar`, `eliminar`.

No se fuerza como FK estricta sobre `usuario_permisos.accion` para permitir el comodín `'todos'`.

## Permiso otorgado (`usuario_permisos`)

Fuente de verdad que consultan las políticas RLS de las tablas de negocio, vía
`private.tiene_permiso(modulo, accion)` (`schema_02_permisos.sql` §3-4). **Modelo por presencia**,
no por columna booleana `otorgado`: que exista la fila = permiso otorgado; que no exista = sin
permiso. `accion = 'todos'` es un comodín que da acceso a cualquier acción de ese módulo.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, FK → `empresas.id` on delete cascade | |
| `usuario_id` | uuid, FK → `usuarios.id` on delete cascade | en la práctica solo aplica a operarios (admin/superusuario tienen acceso total por rol, no por fila aquí) |
| `modulo_clave` | text, FK → `modulos.clave` | |
| `accion` | text | una de `acciones_disponibles.accion`, o `'todos'` |
| `otorgado_por` | uuid, FK → `usuarios.id` | quién otorgó el permiso |
| `created_at` | timestamptz | |

UNIQUE (`usuario_id`, `modulo_clave`, `accion`).

**Regla de negocio (FR-019, FR-027, FR-028 — trigger `otorgar_permisos_default_operario`,
`schema_03_ver_y_defaults.sql`)**: al crear un usuario con `rol = 'operario'`, se insertan
automáticamente:
- `ver` en todos los módulos operativos **excepto** `usuarios` y `configuracion` (información
  sensible/administrativa — no vienen por defecto).
- `crear` solo en `combustible`, `mantenimiento`, `checklist`, `archivos` (donde el operario
  captura información en campo).
- `editar` y `eliminar` **nunca** se otorgan por defecto — siempre los asigna el administrador
  explícitamente desde la pantalla de permisos (US6).

> Nota de alcance: esta feature (001) es la que construye la UI de esa pantalla de permisos; el
> trigger que otorga los defaults ya existe en `schema_03_ver_y_defaults.sql` y se aplica tal
> cual.

RLS (`schema_02_permisos.sql` §3): el propio usuario ve sus permisos (para pintar su menú); el
admin ve/administra los de su empresa; superusuario ve todo.

## Auditoría (`auditoria`)

Bitácora (constitución §2), ya definida en `schema.sql` §17: solo INSERT (vía trigger de
aplicación), nunca UPDATE/DELETE — políticas `auditoria_no_update`/`auditoria_no_delete` ya usan
`using (false)`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, FK → `empresas.id` on delete cascade, **nullable** (extensión) | `schema.sql` lo define `NOT NULL`; se relaja porque un superusuario no tiene empresa y aun así se audita su alta |
| `usuario_id` | uuid, FK → `usuarios.id`, **nullable** (extensión) | `schema.sql` lo define `NOT NULL`; se relaja porque `private.actor_id()` puede no resolver un actor (escrituras `service_role` sin actor conocido, ej. la primera empresa+admin) |
| `entidad` | text | `empresa` \| `usuario` \| `usuario_permisos` (en esta feature) |
| `entidad_id` | uuid | |
| `accion` | enum `accion_auditoria` | **Extensión de esta feature**: `schema.sql` solo define `crear\|editar\|eliminar\|cancelar`; US2/US8/US9 necesitan distinguir "desactivar"/"reactivar" de "editar" genérico — se agregan esos dos valores al enum vía `ALTER TYPE accion_auditoria ADD VALUE`, en la misma migración que agrega `empresas.activo`. |
| `valores_antes`, `valores_despues` | jsonb | |
| `created_at` | timestamptz | |

## Extensiones sobre `schema.sql` que esta feature debe agregar

`schema.sql` es un v1 que el propio autor marca como "pendiente de refinar". Para que las 10
historias de usuario de esta feature funcionen, además de aplicar los 4 archivos de
`docs/schema-reference/` tal cual, se necesita una migración adicional con:

1. `alter table public.empresas add column activo boolean not null default true;` — soporta
   US7/FR-006/007/008 (no existe en `schema.sql`).
2. `alter type accion_auditoria add value 'desactivar'; alter type accion_auditoria add value
   'reactivar';` — para que la bitácora distinga desactivación de edición genérica.
3. Trigger sobre `empresas` y `usuarios` (columna `activo`) → `auditoria`, análogo al patrón que
   `schema.sql` ya usa para otras tablas, pero `schema.sql` no incluye triggers de auditoría
   automática todavía (los inserts a `auditoria` se documentan como responsabilidad de la
   aplicación — ver `schema.sql` línea 675 "solo INSERT vía trigger de aplicación"). Esta feature
   decide implementarlo como triggers de base de datos, no como inserts manuales en
   `server/api/`, por la razón ya documentada en `research.md` R8 (no depende de que el código
   recuerde loguear).
4. Política RLS de `select` sobre `empresas` (`empresas_select`, ya existe en `schema.sql`) no
   necesita cambios: un usuario ya solo ve su propia empresa; el bloqueo de login por empresa
   inactiva se resuelve en la capa de aplicación (`app/pages/login.vue` en el momento del login,
   y `app/middleware/auth.global.ts` en cada navegación posterior — ver G3 del análisis), no en
   RLS, porque RLS no impide el `signInWithPassword` en sí, solo el acceso a datos después de
   autenticado.
5. `auditoria.usuario_id` **y** `auditoria.empresa_id` pasan a nullable (`schema.sql` los define
   `NOT NULL`) — descubierto al sembrar el superusuario inicial (T023): su fila en `usuarios`
   tiene `empresa_id = null`, y el trigger de auditoría intentaba insertar `auditoria.empresa_id
   = null`, violando el constraint.

## Relaciones (resumen)

```
empresas (1) ──< usuarios (N)              [empresa_id, NULL solo para superusuario]
usuarios (1) ──< usuario_permisos (N)      [en la práctica, solo operarios]
modulos  (1) ──< acciones_disponibles (N)
modulos  (1) ──< usuario_permisos (N)
usuarios / empresas / usuario_permisos ──> auditoria   [vía triggers, no FK directa]
```
