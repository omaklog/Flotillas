# Contrato: Autenticación

Endpoints Nitro (`server/api/`) para las piezas de login que no pueden resolverse enteramente en
el cliente. El login y la recuperación de contraseña en sí pasan por
`supabase.auth.signInWithPassword` / `supabase.auth.resetPasswordForEmail` en el cliente (patrón
estándar de `@nuxtjs/supabase`), no por endpoints propios.

## `POST /api/auth/verify-captcha`

Verifica un token de Cloudflare Turnstile antes de permitir que el formulario de login se envíe.
No requiere sesión (se llama antes de iniciar sesión).

**Request**:
```json
{ "token": "string (token de Turnstile)" }
```

**Response 200**:
```json
{ "valid": true }
```

**Response 400**:
```json
{ "valid": false, "error": "captcha_invalid" }
```

**Reglas**:
- Llama al endpoint `siteverify` de Cloudflare con el `secret key` (variable de entorno,
  server-only).
- No expone el `secret key` ni la respuesta cruda de Cloudflare al cliente.
- Rate-limit básico por IP (usar el mismo mecanismo de protección de fuerza bruta ya provisto por
  Supabase Auth para el intento de login subsecuente; este endpoint solo gatea el envío del
  formulario, no reemplaza esa protección).

## Empresa desactivada / usuario inactivo en login

No es un endpoint propio: el chequeo de `usuarios.activo` / `empresas.activo` (booleanos, ver
`data-model.md`) ocurre en **dos puntos**, no solo uno:

1. **En el login** (`app/pages/login.vue`, US2): inmediatamente después de un
   `signInWithPassword` exitoso, antes de redirigir — si la empresa o el usuario tienen
   `activo = false`, se cierra la sesión recién creada (`supabase.auth.signOut()`) y se muestra el
   mensaje explícito de "empresa desactivada" (FR-007) en vez de completar el login.
2. **En cada navegación posterior** (`app/middleware/auth.ts`, Foundational): un usuario que ya
   tenía sesión iniciada cuando su empresa (o su propia cuenta) se desactiva no debe conservar
   acceso hasta que su JWT expire por sí solo (hasta 1h) — el middleware repite el mismo chequeo en
   cada navegación y corta la sesión igual que el punto 1. Esto es lo que cumple la Assumption de
   `spec.md` ("las sesiones se cortan en la siguiente solicitud autenticada al sistema").
