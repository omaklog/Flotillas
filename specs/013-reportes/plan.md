# Implementation Plan: Reportes

**Branch**: `013-reportes` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-reportes/spec.md`

## Summary

Cuatro reportes tabulares de solo lectura (costos de mantenimiento, consumo/rendimiento de
combustible, vencimientos, cumplimiento), calculados 100% en el cliente contra tablas ya
existentes (sin schema de datos nuevo) — mismo patrón ya usado en `useDashboard.ts`: consultas
Supabase directas + agregación en JS donde PostgREST no puede expresarla. El único cálculo nuevo
de verdad es el rendimiento de combustible (`LAG` en JS sobre la historia completa activa del
vehículo, research.md R1). Exportación a Excel (`exceljs`) y PDF (`jspdf`/`jspdf-autotable`)
también se genera en el cliente (research.md R2/R3) — primera vez que el proyecto genera
archivos descargables además de subir/servir los ya existentes. La única pieza de servidor nueva
es un endpoint privilegiado (`server/api/reportes/auditar-exportacion.post.ts`) que registra cada
exportación en la bitácora de auditoría (FR-017), respetando la convención ya establecida de que
`auditoria` nunca se escribe directo desde el cliente (research.md R4) — requiere una migración
mínima (`accion_auditoria` + valor `'exportar'`). Sin pantalla de Stitch dedicada: se reutilizan
componentes y tokens ya aprobados de `docs/design-system.md` (research.md R5).

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS para el servidor
Nitro/cliente Nuxt 4 — sin cambios de plataforma respecto al resto del proyecto.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` (ya
instaladas, sin cambios). Nuevas: `exceljs` (research.md R2), `jspdf` + `jspdf-autotable`
(research.md R3) — únicas dependencias nuevas de esta feature.

**Storage**: PostgreSQL gestionado por Supabase. Una migración mínima:
`alter type accion_auditoria add value 'exportar'` (data-model.md, research.md R4). Ninguna
tabla nueva, ninguna política RLS nueva ni modificada — el permiso `reportes.exportar` y el
default `reportes.ver` ya existen desde `schema_02_permisos.sql`/`schema_03_ver_y_defaults.sql`.

**Testing**: Playwright para UI (los 4 reportes, filtros, exportación) y para el endpoint interno
nuevo (`auditar-exportacion.post.ts`) por HTTP directo, mismo patrón ya usado en el resto del
proyecto — sin mocks de infraestructura.

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios
para el shell de la app. Los archivos exportados se generan y descargan enteramente en el
navegador (sin streaming de servidor).

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt. Un endpoint `server/api/`
nuevo (interno, `reportes/auditar-exportacion.post.ts`), sin Edge Functions ni infraestructura
adicional.

**Performance Goals**: SC-001 — cualquiera de los 4 reportes se genera en menos de 10 segundos
con el rango de fechas típico de una flotilla. Sin metas de throughput de servidor (todo el
cálculo pesado, incluido el `LAG` de combustible, ocurre en el navegador sobre datos ya
descargados vía RLS).

**Constraints**: WCAG 2.1 AA en filtros y tablas de los 4 reportes (constitución §4). El endpoint
de auditoría de exportación MUST verificar sesión + permiso `reportes.exportar` server-side antes
de escribir (research.md R4 — la política RLS de `auditoria` no valida ese permiso por sí sola).
Mismo riesgo aceptado de límite de 1000 filas de PostgREST que el resto del proyecto
(research.md R6) — sin paginación de servidor nueva.

**Scale/Scope**: 4 historias de usuario, 1 migración (`accion_auditoria` + `'exportar'`), 1
endpoint `server/api/` nuevo, 1 composable nuevo (`useReportes.ts`), 2 utilidades de exportación
nuevas (`exportarExcel.ts`, `exportarPdf.ts`), 1 o más páginas nuevas bajo `admin/reportes/` y
`operario/reportes/` (detalle de rutas en `/speckit-tasks`), 2 dependencias nuevas (`exceljs`,
`jspdf` + `jspdf-autotable`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración; el endpoint nuevo y `useReportes.ts` se escriben en TS estricto, igual que el resto del proyecto. |
| §1 Monolito modular, un solo repo/deploy | Sin infraestructura nueva — un endpoint más dentro de `server/api/`, dos dependencias de npm que corren tanto en cliente como (si hiciera falta) en Nitro, sin servicios externos. |
| §1 PWA instalable, responsivo | Los reportes reutilizan el shell/layout ya existente; sin cambios al manifest/service worker. La generación de archivos en el navegador funciona igual offline-first que cualquier otra pantalla (no depende de un servicio externo). |
| §2 RLS obligatorio en toda tabla | Ninguna tabla nueva. Las 4 consultas de reportes heredan la RLS ya existente de `mantenimientos`/`cargas_combustible`/`conductores`/`vehiculos`/`vehiculo_permisos`/`checklists`/`servicios_obligatorios` — un usuario sin `ver` en el módulo de origen recibe 0 filas (Edge Cases de spec.md), nunca datos de otra empresa (FR-016). |
| §2 `service_role` nunca al cliente | La `service_role` key del endpoint de auditoría vive solo en `server/utils/supabaseAdmin.ts` (ya existente, reutilizado sin cambios), nunca en código enviado al navegador — mismo criterio ya aplicado en `alertas/notificar.post.ts`. |
| §2 Bitácora de auditoría | **Caso nuevo, no cubierto por el trigger genérico**: exportar un reporte no es un insert/update/delete sobre una tabla de negocio, así que el trigger de `schema_13` no aplica. Se resuelve con un insert explícito y privilegiado desde el endpoint nuevo (research.md R4/R4, FR-017) — respeta la convención ya documentada en `useAuditoria.ts` de que `auditoria` nunca se escribe directo desde el cliente. |
| §3 Autenticación con captcha, roles de 3 niveles | Sin cambios — el endpoint de auditoría de exportación usa la sesión normal del usuario (`serverSupabaseUser`), no un secreto compartido (a diferencia de `alertas/notificar.post.ts`, que sí es servidor-a-servidor); valida rol/permiso como cualquier otro endpoint mutante del proyecto. |
| §3 Archivos validados por tipo/tamaño | No aplica en el sentido de subida — los archivos que esta feature genera (Excel/PDF) los crea el propio navegador a partir de datos ya autorizados por RLS, no se suben ni se sirven de vuelta al servidor. |
| §3 Sin datos fiscales/credenciales en logs | El endpoint de auditoría solo persiste `{ formato, filtros }` (rango de fechas, id de vehículo) en `valores_despues` — nunca el contenido del reporte ni datos personales sueltos fuera de lo que ya vive en las tablas de origen. |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | Tests nuevos: operario sin `reportes.exportar` bloqueado en la UI y en el endpoint (negativo) + con el permiso otorgado sí puede exportar y queda auditado (positivo); operario sin `ver` del módulo de origen bloqueado del reporte correspondiente (negativo) — quickstart.md Escenarios 5 y 6. |
| §4 WCAG 2.1 AA | Filtros y tablas de los 4 reportes siguen el mismo patrón ya accesible de los listados existentes (research.md R5) — sin gráficas nuevas que requieran alternativa textual. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md` 16/16, las 4 preguntas de `/speckit-clarify` resueltas). |

Sin violaciones bloqueantes — la única fila que requiere justificación explícita (§2, escritura
de auditoría fuera del trigger genérico) queda documentada en la tabla misma y en research.md R4,
no es una excepción a ningún principio (la bitácora sigue siendo obligatoria y completa, solo
cambia el mecanismo de escritura para un caso que el trigger genérico no puede cubrir).

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/reportes.md` no introducen
ninguna excepción nueva a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/013-reportes/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md               # Fase 1
├── quickstart.md               # Fase 1
├── contracts/                  # Fase 1
│   └── reportes.md
├── checklists/
│   └── requirements.md
└── tasks.md                    # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

```text
flotillas/
├── docs/
│   └── schema-reference/
│       └── schema_15_reportes_ajustes.sql   # nuevo — copia de referencia de la migración
├── supabase/
│   └── migrations/
│       └── <timestamp>_reportes_auditoria_exportar.sql   # nuevo — alter type accion_auditoria
├── server/
│   ├── api/
│   │   └── reportes/
│   │       └── auditar-exportacion.post.ts   # nuevo, interno (research.md R4)
│   └── utils/
│       └── supabaseAdmin.ts                  # ya existente, reutilizado sin cambios
├── app/
│   ├── composables/
│   │   └── useReportes.ts                    # nuevo — un método por reporte (contracts/reportes.md)
│   ├── utils/
│   │   ├── exportarExcel.ts                  # nuevo (research.md R2)
│   │   └── exportarPdf.ts                    # nuevo (research.md R3)
│   └── pages/
│       ├── admin/
│       │   └── reportes/
│       │       └── index.vue                 # nuevo — 4 secciones (US-13.1 a US-13.4)
│       └── operario/
│           └── reportes/
│               └── index.vue                 # nuevo — mismo contenido, gateado por permiso
├── tests/
│   └── e2e/
│       ├── reportes.spec.ts                  # nuevo — US-13.1 a US-13.4, exportación, auditoría
│       └── rls.spec.ts                       # + caso de aislamiento del módulo reportes
```

**Structure Decision**: un composable único (`useReportes.ts`) para los 4 reportes, en vez de uno
por reporte, porque comparten el mismo tipo de filtro (`FiltrosReporte`/`RangoFechas`,
data-model.md) y el mismo patrón de "consulta + agregación en JS" — separar en 4 archivos no
aportaría aislamiento real (mismo criterio que agrupar los métodos del dashboard en un solo
`useDashboard.ts`, Feature 012). Página única con 4 secciones (en vez de 4 rutas independientes)
para reforzar visualmente que "Reportes" es una sola pantalla con distintas vistas, no 4 módulos
separados — el detalle final de navegación (tabs vs. acordeón vs. rutas) se decide en
`/speckit-tasks` sin impacto en el modelo de datos ni en el contrato ya definidos aquí.

## Complexity Tracking

*Sin violaciones que justificar — la tabla de Constitution Check no dejó ninguna fila bloqueante.*
