# Implementation Plan: Autenticación, Configuración Inicial, Usuarios y Permisos

**Branch**: `001-auth-config-usuarios` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-auth-config-usuarios/spec.md`

## Summary

Primer feature del proyecto: bootstrap completo de la aplicación Nuxt 4 + login multi-rol
(superusuario/administrador/operario) sobre Supabase Auth, alta de empresas (tenants) con su
primer administrador vía invitación por correo, configuración de empresa, gestión de operarios, y
la pantalla de asignación de permisos granulares por módulo/acción que sostiene el resto del
sistema de RLS del proyecto. Enfoque técnico: `@nuxtjs/supabase` para sesión SSR-safe,
`vuetify-nuxt-module` con el tema extraído de `docs/design-system.md`, endpoints `server/api/`
solo para las operaciones que requieren `service_role` (crear empresa+admin, invitar, cambiar
estado, asignar permisos), triggers de PostgreSQL para la bitácora de auditoría, y Playwright con
sesiones pre-autenticadas por rol para cubrir los tests de RLS que exige la constitución.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module` (Vuetify 3), `@nuxtjs/supabase`
(sesión SSR + composables sobre `@supabase/supabase-js`), `@vite-pwa/nuxt` (PWA), `nodemailer`
(invitaciones y notificaciones propias). Sin Pinia (ver `research.md` R7). Captcha (Cloudflare
Turnstile) vía composable propio, sin dependencia npm adicional (ver `research.md` R5).

**Storage**: PostgreSQL gestionado por Supabase; esquema versionado con migraciones SQL
(Supabase CLI). Tablas de esta feature: `empresas`, `usuarios`, `modulos`, `acciones`,
`modulo_acciones`, `permisos`, `auditoria` (ver `data-model.md`).

**Testing**: Playwright (única herramienta de pruebas mandatada por la constitución §4), con
sesiones pre-autenticadas por rol vía `global-setup` (ver `research.md` R10). Cobertura mínima:
70% en captura de datos, 100% en políticas RLS de tablas sensibles (`empresas`, `usuarios`,
`permisos`).

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable.

**Project Type**: Aplicación web full-stack de un solo proyecto (Nuxt: `app/` cliente + `server/`
Nitro backend en el mismo deploy) — no aplica el split "frontend/backend" del template genérico,
ver Project Structure.

**Performance Goals**: sin metas de throughput específicas para esta feature (no es un servicio
de alto volumen); objetivo cualitativo: formularios de alta/login responden en <2s en condiciones
normales de red.

**Constraints**: WCAG 2.1 AA en formularios de login/alta/permisos (constitución §4); ningún dato
fiscal, contraseña o credencial se registra en logs de aplicación (constitución §3); `service_role`
y `admin.generateLink` solo se usan en `server/api/`, nunca en código que se envía al cliente.

**Scale/Scope**: 3 roles, 10 historias de usuario, ~7 tablas nuevas, alcance acotado a
identidad/acceso — no incluye los módulos de negocio (vehículos, combustible, etc.), que son
features posteriores.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | `nuxt.config.ts` con `typescript.strict: true`; sin `any` implícito. |
| §1 Monolito modular Nuxt 4 + Vuetify, un solo repo/deploy | Un único proyecto Nuxt (`app/` + `server/`); módulo de usuarios/permisos aislado en sus propias carpetas, sin microservicios. |
| §1 PWA instalable, responsivo | `@vite-pwa/nuxt` (manifest + service worker); Vuetify con breakpoints definidos en `docs/design-system.md`. |
| §2 RLS obligatorio en toda tabla | `empresas`, `usuarios`, `permisos` (y catálogos) llevan políticas RLS desde su migración de creación — no hay tabla sin RLS. |
| §2 `service_role` nunca al cliente | Confinado a `server/utils/supabaseAdmin.ts`, importado solo dentro de `server/api/**` (Nitro no envía código de `server/` al bundle del cliente). |
| §2 Bitácora de auditoría | Triggers en `empresas`/`usuarios`/`permisos` → tabla `auditoria` (research.md R8), no depende de que el código de aplicación recuerde loguear. |
| §2 Integridad referencial de negocio en eliminaciones | `DELETE /api/usuarios/:id` valida ausencia de operaciones registradas antes de eliminar (contracts/usuarios.md); si existen, ofrece desactivar. |
| §3 Captcha + recuperación de contraseña obligatorios | Turnstile en login (US-1.5); `resetPasswordForEmail` de Supabase Auth (US-1.6). |
| §3 Roles de tres niveles, sin endpoint de escritura sin verificar rol | Cada endpoint de `server/api/` valida rol explícitamente además de RLS (contracts/*.md). |
| §3 Archivos adjuntos validados, nunca servidos como HTML | Logo de empresa: validación de tipo/tamaño antes de subir a Supabase Storage. |
| §3 Sin datos fiscales/contraseñas en logs | Sin `console.log` de payloads completos en endpoints que reciben RFC/contraseña; solo IDs y eventos. |
| §4 Playwright, RLS con caso negativo obligatorio | `research.md` R10; `quickstart.md` sección de validación de RLS explícita para `empresas`/`usuarios`/`permisos`. |
| §4 WCAG 2.1 AA | Vuetify (accesible por defecto) + labels/aria explícitos en formularios custom. |
| §5 Proceso spec→plan→tasks | Este documento es el resultado de `/speckit-plan` sobre `spec.md`; no se salta ningún paso del flujo. |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): el diseño de datos (`data-model.md`) y los contratos
(`contracts/`) no introducen ninguna excepción a lo anterior — se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-config-usuarios/
├── plan.md              # Este archivo
├── research.md           # Fase 0
├── data-model.md          # Fase 1
├── quickstart.md          # Fase 1
├── contracts/             # Fase 1
│   ├── auth.md
│   ├── empresas.md
│   └── usuarios.md
└── tasks.md               # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Nuxt 4 es full-stack en un solo proyecto (Nitro integrado): no aplica el split genérico
"frontend/backend" del template — `app/` es el cliente, `server/` es el backend, ambos en el
mismo deploy, como exige la constitución ("un solo repo/deploy").

```text
flotillas/
├── app/
│   ├── assets/
│   ├── components/
│   │   ├── empresas/          # formulario alta empresa, listado, detalle
│   │   ├── usuarios/          # listado operarios/administradores, invitación
│   │   └── permisos/          # pantalla de asignación granular (US-1.9)
│   ├── composables/
│   │   ├── useTurnstile.ts
│   │   ├── usePermisos.ts     # caché reactiva de permisos del usuario actual
│   │   └── useAuth.ts
│   ├── layouts/
│   │   ├── superusuario.vue
│   │   ├── admin.vue
│   │   └── default.vue
│   ├── middleware/
│   │   └── auth.ts            # guard de rutas por rol
│   ├── pages/
│   │   ├── login.vue
│   │   ├── recuperar-password.vue
│   │   ├── superusuario/
│   │   │   └── empresas/
│   │   └── admin/
│   │       ├── configuracion.vue
│   │       ├── usuarios/
│   │       └── permisos/
│   ├── plugins/
│   └── app.vue
├── server/
│   ├── api/
│   │   ├── auth/
│   │   │   └── verify-captcha.post.ts
│   │   ├── empresas/
│   │   │   ├── index.post.ts
│   │   │   └── [id]/
│   │   │       ├── estado.patch.ts
│   │   │       └── administradores.post.ts
│   │   └── usuarios/
│   │       ├── index.post.ts
│   │       └── [id]/
│   │           ├── estado.patch.ts
│   │           ├── reenviar-invitacion.post.ts
│   │           ├── permisos.put.ts
│   │           └── index.delete.ts
│   └── utils/
│       ├── supabaseAdmin.ts   # cliente service_role, solo importado en server/api
│       └── mailer.ts          # Nodemailer + plantillas
├── supabase/
│   ├── migrations/
│   └── seed.sql               # modulos, acciones, modulo_acciones
├── tests/
│   └── e2e/
│       ├── global-setup.ts    # siembra + login programático por rol
│       ├── auth.spec.ts
│       ├── empresas.spec.ts
│       ├── usuarios.spec.ts
│       └── permisos.spec.ts
├── docs/                       # ya existe (design-system.md, design-references/)
├── nuxt.config.ts
├── vuetify.config.ts
├── playwright.config.ts
└── package.json
```

**Structure Decision**: proyecto único Nuxt 4 (`app/` + `server/`), sin separación en paquetes ni
repos adicionales — es la estructura que exige la constitución ("monolito modular... un solo
repo/deploy"). La modularidad por dominio se logra por carpeta (`components/empresas`,
`components/usuarios`, `components/permisos`, endpoints agrupados igual en `server/api/`), no por
separación de proyectos.

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
