# Contrato: Empresas

Todos requieren sesión de `superusuario` (verificado server-side, no solo ocultando el botón en
UI). Usan `service_role` internamente (`admin.generateLink`, creación de usuario en
`auth.users`) — por eso son endpoints de `server/api/`, no operaciones directas del cliente
contra Supabase.

## `POST /api/empresas`

Alta de empresa + primer administrador (US-1.1).

**Request** (campos alineados a `docs/schema-reference/schema.sql` — ver `data-model.md`; no al
diseño original de este contrato, que asumía `telefonos: string[]` y `unidad_distancia: "mi"`
antes de tener el esquema real):
```json
{
  "empresa": {
    "nombre": "string",
    "rfc": "string",
    "telefono_oficina_1": "string | null",
    "telefono_oficina_2": "string | null",
    "telefono_movil": "string | null",
    "correo": "string (email) | null",
    "pais": "string",
    "moneda": "string (ISO 4217)",
    "unidad_distancia": "km | millas",
    "unidad_combustible": "litros | galones"
  },
  "administrador": {
    "nombre": "string",
    "correo": "string (email)"
  }
}
```

**Response 201**:
```json
{ "empresa_id": "uuid", "usuario_id": "uuid" }
```

**Errores**:
- `409 rfc_duplicado` — ya existe una empresa con ese RFC.
- `409 correo_en_uso` — el correo del administrador ya existe en `auth.users`.
- `422 validation_error` — campos faltantes o con formato inválido.

**Reglas de negocio**:
- Operación transaccional: si falla la creación del usuario administrador, no debe quedar una
  empresa huérfana sin administrador (rollback de la fila de `empresas` si el paso de
  `auth.admin.createUser`/`generateLink` falla). No es una transacción de base de datos real
  (crear el usuario en `auth.users` es una llamada a la API de administración de Supabase Auth,
  no SQL) — es una acción compensatoria: si falla el paso de `auth.admin`, se borra la fila de
  `empresas` recién creada antes de responder el error.
- `rfc` tiene restricción `UNIQUE` a nivel de base de datos (migración
  `20260806160903_empresas_rfc_unique.sql` — `schema.sql` no la traía).
- Dispara el correo de invitación (Nodemailer) al finalizar exitosamente.

## `PATCH /api/empresas/:id`

Actualizar la configuración de una empresa (US-1.4/FR-011): nombre, RFC, teléfonos, correo, logo,
unidad de distancia, unidad de combustible, país y moneda. Distinto del `PATCH .../estado` de
abajo (US7), que solo toca `activo`.

Requiere sesión de `superusuario`, o de `admin` de esa misma empresa — a diferencia de
`POST /api/empresas`, esta escritura la hace el cliente autenticado del propio usuario (RLS de
`empresas_update`), no `service_role`: no hace falta crear usuarios ni generar enlaces, así que
no hay razón para saltarse RLS.

**Request** (todos los campos opcionales — semántica PATCH real, solo se tocan los presentes):
```json
{
  "nombre": "string",
  "rfc": "string",
  "telefono_oficina_1": "string | null",
  "telefono_oficina_2": "string | null",
  "telefono_movil": "string | null",
  "correo": "string (email) | null",
  "logo_url": "string | null",
  "pais": "string",
  "moneda": "string (ISO 4217)",
  "unidad_distancia": "km | millas",
  "unidad_combustible": "litros | galones"
}
```

**Response 200**: la fila completa de `empresas` ya actualizada.

**Errores**:
- `401` — no autenticado.
- `403` — autenticado pero no es superusuario ni admin de esa empresa (RLS excluye la fila; se
  responde 403 genérico y no 404, para no revelar si el id de empresa existe).
- `409 rfc_duplicado` — el RFC ya lo usa otra empresa.
- `422 validation_error` — body vacío, o `nombre`/`rfc` vacíos, o `correo` con formato inválido.

**Reglas de negocio**:
- FR-012: cambiar `unidad_distancia`/`unidad_combustible` NO reescribe ni convierte ningún otro
  campo ni registro — es un `UPDATE` normal sobre la fila de `empresas`, nada más.
- La subida del archivo de logo a Supabase Storage (T048) es un paso previo y separado; este
  endpoint solo guarda la URL resultante en `logo_url`.

## `PATCH /api/empresas/:id/estado`

Activar/desactivar una empresa (US7). Cambia la columna `empresas.activo` (extensión sobre
`schema.sql` — ver `data-model.md` "Extensiones sobre schema.sql" y `research.md` R12).

**Request**:
```json
{ "activo": false }
```

**Response 200**:
```json
{ "id": "uuid", "activo": false }
```

**Reglas de negocio**:
- Al pasar a `activo: false`, envía correo de notificación a todos los administradores activos de
  esa empresa (FR-008).
- No elimina ningún dato.

## `POST /api/empresas/:id/administradores`

Invitar un administrador adicional a una empresa existente (US-1.3).

**Request**:
```json
{ "nombre": "string", "correo": "string (email)" }
```

**Response 201**:
```json
{ "usuario_id": "uuid" }
```

**Errores**: `409 correo_en_uso`, `422 validation_error`, `404 empresa_no_encontrada`.

## `PATCH /api/usuarios/:id/estado` (uso compartido con administradores de empresa)

Ver `contracts/usuarios.md` — revocar el acceso de un administrador (US8) usa el mismo contrato
que desactivar un operario (US9): mismo endpoint, mismo efecto (`activo = false` bloquea login,
conserva historial).
