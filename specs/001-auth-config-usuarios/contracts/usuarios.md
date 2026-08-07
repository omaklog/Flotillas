# Contrato: Usuarios (administradores y operarios)

Requieren sesión de `administrador` (para operarios de su propia empresa) o `superusuario` (para
administradores de cualquier empresa) — verificado server-side vía RLS + chequeo explícito de rol
en el handler. Campos alineados a `docs/schema-reference/schema.sql` / `schema_02_permisos.sql`
(ver `data-model.md`): `usuarios.activo boolean`, no una columna de texto "estado"; permisos por
`modulo_clave`/`accion` (texto), no `modulo_id`/`accion_id` (uuid).

## `POST /api/usuarios`

Invitar un operario a la empresa del administrador que hace la llamada (US5). El `empresa_id` se
toma de la sesión del administrador, nunca del body, para que un admin no pueda invitar usuarios
a otra empresa.

**Request**:
```json
{ "nombre": "string", "correo": "string (email)" }
```

**Response 201**:
```json
{ "usuario_id": "uuid", "pendiente": true }
```

`pendiente: true` refleja que `auth.users.email_confirmed_at` sigue nulo — no es una columna de
`public.usuarios`, es lo que la UI muestra derivado de Supabase Auth (ver `research.md` R9).

**Errores**: `409 correo_en_uso`, `422 validation_error`.

**Reglas de negocio**:
- Crea el usuario (`public.usuarios`) con `rol = 'operario'`, `activo = true` (default).
- El trigger `otorgar_permisos_default_operario` (`schema_03_ver_y_defaults.sql`) inserta
  automáticamente en `usuario_permisos`: `ver` en todos los módulos operativos excepto
  `usuarios`/`configuracion`, y `crear` en `combustible`/`mantenimiento`/`checklist`/`archivos`
  (FR-019). El endpoint no duplica esta lógica — solo hace el `insert` en `public.usuarios` y deja
  que el trigger de base de datos se encargue.
- Dispara la invitación por correo (Nodemailer + `admin.generateLink`).

## `PATCH /api/usuarios/:id/estado`

Activar/desactivar un usuario (operario u administrador, según el rol de quien llama). Cambia la
columna `usuarios.activo`.

**Request**:
```json
{ "activo": true }
```

**Response 200**:
```json
{ "id": "uuid", "activo": true }
```

**Reglas de negocio**:
- Un administrador solo puede cambiar `activo` de operarios de su propia empresa.
- Un superusuario solo puede cambiar `activo` de administradores (no de operarios directamente —
  eso es responsabilidad del administrador de la empresa).
- **Guard rail**: si el usuario objetivo es el último administrador activo de su empresa y se
  intenta poner `activo: false`, la operación se rechaza con `409 ultimo_administrador` (ver
  Assumptions en `spec.md`).

## `POST /api/usuarios/:id/reenviar-invitacion`

Reenviar la invitación a un usuario cuyo `auth.users.email_confirmed_at` sigue nulo (US9).

**Response 200**:
```json
{ "id": "uuid", "reenviado": true }
```

**Errores**: `409 usuario_no_pendiente` si `email_confirmed_at` ya no es nulo, o si `activo = false`.

**Reglas de negocio**: genera un nuevo enlace vía `admin.generateLink` (el anterior, si existía,
queda invalidado por Supabase Auth) y reenvía el correo.

## `DELETE /api/usuarios/:id`

Eliminación definitiva de un operario (US9, FR-024/FR-025).

**Response 200**:
```json
{ "id": "uuid", "eliminado": true }
```

**Response 409** (si tiene operaciones registradas):
```json
{ "error": "tiene_operaciones_registradas", "sugerencia": "desactivar" }
```

**Reglas de negocio**: antes de eliminar, verifica ausencia de registros dependientes (cargas de
combustible, mantenimientos, checklists, servicios obligatorios a su nombre) — misma regla de
integridad referencial de negocio que la constitución exige para catálogos (§2). Solo aplica a
operarios; administradores y superusuarios no se eliminan desde esta feature (solo se
desactivan/revocan vía `activo = false`).

## `PUT /api/usuarios/:id/permisos`

Reemplaza el conjunto de permisos otorgados a un operario (US6) en `usuario_permisos`. Solo el
administrador de la empresa del operario puede llamarlo. Modelo **por presencia de fila**, no por
columna booleana: el body indica qué filas deben existir al terminar la llamada; el endpoint
calcula el diff (insertar las que faltan, borrar las que sobran) contra `usuario_permisos`.

**Request**:
```json
{
  "permisos": [
    { "modulo_clave": "vehiculos", "accion": "editar" },
    { "modulo_clave": "combustible", "accion": "todos" }
  ]
}
```

`accion` acepta cualquier valor de `acciones_disponibles.accion` para ese `modulo_clave`, o el
comodín `'todos'` (equivale a otorgar el módulo completo).

**Response 200**:
```json
{ "usuario_id": "uuid", "actualizado": true }
```

**Reglas de negocio**:
- Solo acepta combinaciones (`modulo_clave`, `accion`) que existan en `acciones_disponibles`
  (o el comodín `'todos'`); rechaza combinaciones inválidas con `422`.
- El cambio es efectivo de inmediato para el operario (FR-029): no requiere invalidar su sesión,
  porque las políticas RLS de las tablas de negocio consultan `private.tiene_permiso()` (que lee
  `usuario_permisos`) en cada request, no un claim cacheado en el JWT.
