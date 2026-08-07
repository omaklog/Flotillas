# Quickstart: Autenticación, Configuración Inicial, Usuarios y Permisos

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Node.js LTS instalado.
- Supabase CLI instalado, proyecto local levantado (`supabase start`).
- Variables de entorno configuradas (`.env`, ver `nuxt.config.ts` → `runtimeConfig`):
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (públicas).
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only, nunca en el bundle del cliente).
  - `TURNSTILE_SITE_KEY` (pública), `TURNSTILE_SECRET_KEY` (server-only).
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (credenciales de Resend, para
    Nodemailer).
- Custom SMTP configurado también en el dashboard de Supabase Auth (Authentication → Emails →
  SMTP Settings) con las mismas credenciales de Resend — paso manual, no versionado en código.
- Migraciones aplicadas (`supabase migration up` o `supabase db reset` en local) — incluyen
  `empresas`, `usuarios`, `modulos`, `acciones`, `modulo_acciones`, `permisos`, `auditoria`, sus
  políticas RLS, y el seed de `modulos`/`acciones`/`modulo_acciones`.
- Al menos un superusuario sembrado manualmente en la base (ver Assumptions en `spec.md` — no
  existe UI de alta de superusuario en esta feature):
  ```sql
  -- Ejecutar una sola vez contra el proyecto Supabase (local o el ambiente que corresponda)
  insert into auth.users (id, email, ...) values (...);
  insert into public.usuarios (id, empresa_id, nombre, rol, estado)
    values ('<mismo id>', null, 'Superusuario Inicial', 'superusuario', 'activo');
  ```

## Escenario 1 — Alta de empresa y primer login de administrador (US-1.1, US-1.5)

1. Iniciar sesión como superusuario (`/login`).
2. Ir a "Empresas" → "Nueva empresa", completar los datos de empresa y del primer administrador,
   guardar.
3. **Esperado**: la empresa aparece en el listado; se dispara un correo de invitación al
   administrador (verificar en el proveedor SMTP / bandeja de pruebas de Resend).
4. Abrir el enlace de invitación (simulando al administrador), establecer contraseña.
5. Iniciar sesión con ese correo y la contraseña recién establecida.
6. **Esperado**: redirige a la página principal de administrador.

## Escenario 2 — Empresa desactivada bloquea login (US-1.2, US-1.5)

1. Como superusuario, desactivar la empresa creada en el Escenario 1.
2. **Esperado**: se envía correo de notificación a su administrador.
3. Intentar iniciar sesión con las credenciales del administrador de esa empresa.
4. **Esperado**: mensaje explícito de empresa desactivada, distinto al de credenciales
   incorrectas; el login no procede.

## Escenario 3 — Invitar operario y asignar permisos (US-1.7, US-1.9)

1. Reactivar la empresa del Escenario 1 (o usar una empresa activa) e iniciar sesión como su
   administrador.
2. Ir a "Usuarios" → "Invitar operario", completar nombre y correo, guardar.
3. **Esperado**: el operario aparece en el listado con estado "Pendiente"; tiene otorgados los
   permisos por defecto (ver en todos los módulos, crear en combustible/mantenimiento/
   checklist/archivos).
4. Abrir la pantalla de permisos del operario, otorgar "editar" en un módulo que no lo tenía por
   defecto, guardar.
5. Aceptar la invitación del operario e iniciar sesión con esa cuenta (otra pestaña/sesión).
6. **Esperado**: el operario ya ve la capacidad de "editar" en ese módulo sin haber vuelto a
   iniciar sesión después del paso 4 (si el paso 4 ocurrió con la sesión del operario ya abierta).

## Escenario 4 — Eliminar vs. desactivar operario (US-1.8)

1. Como administrador, intentar eliminar un operario que ya tiene una operación de negocio
   registrada a su nombre (de un módulo fuera de esta feature — puede simularse con un insert
   directo de prueba si esos módulos aún no existen).
2. **Esperado**: el sistema rechaza la eliminación y ofrece desactivar en su lugar.
3. Desactivar ese operario.
4. **Esperado**: no puede iniciar sesión; su historial permanece intacto.
5. Repetir con un operario sin operaciones registradas → la eliminación sí procede.

## Escenario 5 — Recuperación de contraseña sin enumeración (US-1.6)

1. Solicitar recuperación de contraseña con un correo que sí existe.
2. Solicitar recuperación de contraseña con un correo que no existe.
3. **Esperado**: el mensaje de confirmación mostrado en pantalla es idéntico en ambos casos; solo
   el correo que existe recibe el enlace real.

## Validación de RLS (constitución §4 — obligatoria para toda tabla con políticas RLS)

Para cada tabla de esta feature (`empresas`, `usuarios`, `permisos`), correr como mínimo:
- Caso positivo: el rol autorizado puede realizar la operación.
- Caso negativo: un operario (rol restringido) NO puede leer/editar filas fuera de su propia
  empresa, ni escribir en `permisos` directamente (solo vía el endpoint `PUT
  /api/usuarios/:id/permisos`, que corre con privilegios de administrador).

Ver `contracts/` para el detalle de cada endpoint y `data-model.md` para las entidades.
