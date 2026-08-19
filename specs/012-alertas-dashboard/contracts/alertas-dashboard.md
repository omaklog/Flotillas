# Contrato: Alertas y Dashboard

## Edge Function `generar-alertas` (US-12.1)

`POST ${SUPABASE_URL}/functions/v1/generar-alertas`, autenticada con `service_role` (la llama
`pg_cron`/`pg_net`, o un test que simula la corrida — research.md R4). Sin cuerpo de entrada.
Comportamiento completo en `data-model.md` § Edge Function. Responde `200
{ alertasCreadas: number, alertasResueltas: number, correosEnviados: number }`.

## `server/api/alertas/notificar.post.ts` (interno, US-12.1)

`POST /api/alertas/notificar`, `{ alertaId: string }`, protegido por
`Authorization: Bearer <ALERTAS_CRON_SECRET>` (research.md R2) — MUST rechazar con `401` sin ese
header. Reutiliza `sendMail()`/`renderEmailLayout()` (`server/utils/mailer.ts`, ya existentes)
para notificar a los administradores activos de la empresa de la alerta. Responde `200` si se
envió al menos un correo, `204` si la alerta no tenía ningún administrador activo a quien
notificar (Edge Cases de spec.md, escenario 6 de US-12.1) — ninguno de los dos casos es un error.

## Composable `useAlertas.ts` (US-12.2)

`listar(filtros?)` → `{ tipo?, estado? }`, mismo patrón que el resto de composables de listado
del proyecto (`useState` + `.select()` con `.eq()` encadenados solo para filtros presentes,
`.order('created_at', { ascending: false })`).

`contarAbiertas()` → cuenta `estado in ('pendiente','enviada')` para el ícono de la barra
superior (FR-007) — consulta ligera (`select('*', { count: 'exact', head: true })`), no trae
filas completas solo para contar.

`marcarResuelta(id)` → `update({ estado: 'resuelta' }).eq('id', id)` (FR-009) — sin `crear` ni
`eliminar`: las alertas solo las crea la Edge Function (`service_role`), nunca el cliente.

## Composable `useDashboard.ts` (US-12.3)

Un método por sección (`data-model.md` § Consultas del dashboard) — cada uno hace su propia
consulta y devuelve el número/agregado ya calculado, no filas crudas para agregar en el cliente
salvo que Postgres/PostgREST no pueda expresar la agregación directamente (en cuyo caso se trae
lo mínimo necesario y se agrega en JS, mismo criterio ya usado en KPIs de otras features). Sin
`crear`/`editar`/`eliminar` — es de solo lectura.

## Componente `AppNotificacionesAlertas.vue` (US-12.2)

Ícono de campana con badge numérico (`contarAbiertas()`), agregado a `app/layouts/admin.vue` y
`app/layouts/default.vue` (junto a `<AppMenuPerfil />` — este último es el único layout que
usa el operario para su página de inicio, spec.md § Assumptions) — MUST renderizarse en ambos
layouts para que el contador sea visible tanto a administrador como a operario (FR-007). Al hacer
click, navega a la pantalla de alertas.
