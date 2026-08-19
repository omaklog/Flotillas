# Quickstart: Alertas y Dashboard

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado (`supabase start`), con la migración de esta feature aplicada
  (`schema_14`, extensiones `pg_cron`/`pg_net`, agenda del cron — `data-model.md`) y la Edge
  Function `generar-alertas` desplegada localmente (`supabase functions serve generar-alertas`,
  o el contenedor `edge_runtime` ya arriba tras `supabase start` — research.md R4).
- `ALERTAS_CRON_SECRET` configurado en `.env` (ver `.env.example`).
- Una empresa de prueba con: un conductor activo con licencia por vencer en menos de 30 días, un
  vehículo activo con póliza por vencer en menos de 30 días, un permiso de vehículo por vencer, un
  servicio obligatorio por vencer, y un checklist con `resultado='con_observaciones'`.
- Un administrador activo de esa empresa (destinatario esperado del correo) y un operario con los
  permisos por defecto (`ver` en `alertas`, sin `aprobar`).

## Escenario 1 — Corrida del job crea una alerta por cada condición y notifica (US-12.1)

1. Invocar `POST ${SUPABASE_URL}/functions/v1/generar-alertas` directamente (simulando al cron —
   research.md R4).
2. **Esperado**: se crean 5 alertas (`licencia`, `poliza`, `permiso`, `servicio_obligatorio`,
   `checklist`), cada una en `estado='enviada'`.
3. Revisar Mailpit local (`http://127.0.0.1:54424`).
4. **Esperado**: el administrador recibió un correo por cada una de las 4 alertas con fecha de
   vencimiento (no la de `checklist`, que no tiene destinatario distinto — mismo criterio,
   igual se notifica).

## Escenario 2 — Sin duplicados en corridas sucesivas (US-12.1, FR-004)

1. Invocar la Edge Function de nuevo, sin cambiar ningún dato.
2. **Esperado**: no se crea ninguna alerta nueva — las 5 siguen siendo las mismas del Escenario 1.

## Escenario 3 — Auto-resolución cuando la condición deja de aplicar (US-12.1, FR-006)

1. Dar de baja el vehículo del Escenario 1 (cuya póliza generó la alerta `poliza`).
2. Invocar la Edge Function de nuevo.
3. **Esperado**: la alerta `poliza` de ese vehículo pasa a `resuelta`; las otras 4 siguen sin
   cambios.

## Escenario 4 — Panel de alertas y contador (US-12.2)

1. Como administrador, ver la barra superior en cualquier pantalla.
2. **Esperado**: el ícono de notificaciones muestra el número de alertas abiertas.
3. Ir a la pantalla de alertas, aplicar cada filtro (tipo, estado) por separado.
4. **Esperado**: el listado muestra exactamente las alertas que cumplen cada filtro.

## Escenario 5 — Resolver manualmente (US-12.2, FR-009/FR-010)

1. Como administrador, marcar una alerta abierta como resuelta.
2. **Esperado**: pasa a `resuelta` de inmediato, y el contador de la barra superior baja en 1.
3. Como el operario de los Prerrequisitos (sin permiso `aprobar`), abrir la misma pantalla.
4. **Esperado**: puede ver las alertas, pero no tiene disponible la acción de resolverlas.

## Escenario 6 — Dashboard (US-12.3)

1. Como administrador, iniciar sesión (o ir a la página de inicio).
2. **Esperado**: la pantalla de bienvenida genérica fue reemplazada por el dashboard — 4 KPIs, 3
   gráficas de pastel, e indicador de cumplimiento de checklists, todos con datos correctos
   contra los módulos de origen.
3. Repetir como el operario de los Prerrequisitos.
4. **Esperado**: ve el mismo dashboard; cualquier sección cuyo módulo de origen no tenga permiso
   `ver` otorgado se muestra vacía/en cero, sin error.

## Notas de validación no funcional

- **Auditoría** (constitución §2): marcar una alerta como resuelta manualmente genera una fila en
  `public.auditoria` (`entidad='alertas'`, `accion='editar'` — ya cubierto por el trigger
  genérico existente, sin trabajo nuevo de auditoría en esta feature).
- **RLS** (constitución §2, §4): confirmar, llamando directo al cliente Supabase, que un operario
  sin el permiso `aprobar` no puede actualizar una alerta ni siquiera saltándose la UI.
- **Fallo de correo no bloquea la alerta** (Edge Cases): simular un fallo del endpoint de correo
  (ej. `ALERTAS_CRON_SECRET` incorrecto) y confirmar que la alerta igual queda creada en
  `pendiente`, visible in-app.
- **Accesibilidad** (constitución §4): el panel de alertas y el dashboard deben cumplir
  WCAG 2.1 AA — las gráficas de pastel MUST tener una alternativa textual (ej. tabla o lista de
  valores) para lectores de pantalla, no solo el gráfico visual.
