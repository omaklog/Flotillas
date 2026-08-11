# Quickstart: Bitácora de Servicios Obligatorios

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado (`supabase start`, `.env` configurado), con la migración nueva de esta
  feature aplicada (`testigo_servicio` en el enum `tipo_archivo`, trigger de auditoría —
  `data-model.md`, sección "Extensiones sobre el esquema actual").
- Un administrador activo de una empresa de prueba, con al menos un vehículo activo.
- Un operario activo de esa misma empresa con los permisos por defecto (`ver` en
  `servicios_obligatorios`, sin `editar`).

## Escenario 1 — Registrar un servicio obligatorio completo (US-10.1)

1. Como administrador, ir a "Servicios Obligatorios" → "Nuevo".
2. Seleccionar el vehículo de los Prerrequisitos, el tipo "Verificación ambiental", una fecha de
   realización de hoy, y una fecha de vencimiento posterior.
3. Adjuntar un comprobante (PDF o imagen).
4. **Esperado**: el servicio se registra, queda visible en el listado, y el comprobante está
   disponible para ver/descargar desde su detalle.

## Escenario 2 — Validaciones de fecha (US-10.1, FR-003, FR-004)

1. Repetir el registro del Escenario 1, pero con una fecha de realización futura.
2. **Esperado**: el sistema bloquea el envío con un mensaje claro.
3. Corregir la fecha de realización a hoy, y capturar una fecha de vencimiento igual o anterior a
   ella.
4. **Esperado**: el sistema bloquea el envío con un mensaje claro.

## Escenario 3 — Indicador de vigencia en el listado (US-10.2, FR-009)

1. Registrar 3 servicios para el mismo vehículo con fechas de vencimiento distintas: una vencida
   (en el pasado), una dentro de los próximos 60 días, y una a más de 60 días.
2. Ir al listado.
3. **Esperado**: cada uno muestra su indicador correcto — "Vencido" (rojo), "Por vencer"
   (amarillo), "Vigente" (verde).

## Escenario 4 — Filtros del listado (US-10.2, FR-008)

1. Con varios servicios ya registrados (de distintos vehículos, tipos y fechas), aplicar cada
   filtro por separado: vehículo, tipo, rango de fechas.
2. **Esperado**: el listado muestra exactamente los registros que cumplen cada filtro.

## Escenario 5 — Editar un servicio existente (US-10.3, FR-006)

1. Abrir un servicio ya registrado y editar su fecha de vencimiento.
2. **Esperado**: el cambio se guarda y se refleja de inmediato en el listado (incluido su
   indicador de vigencia, si cambió de categoría) y en el detalle.
3. Intentar editar capturando una combinación de fechas inválida (Escenario 2).
4. **Esperado**: se bloquea igual que en el registro.

## Escenario 6 — Eliminar un servicio (US-10.3, FR-007)

1. Eliminar un servicio ya registrado (con comprobante adjunto).
2. **Esperado**: desaparece del listado de inmediato, sin ningún mensaje de bloqueo.

## Escenario 7 — Operario sin permiso `editar` (research.md R2)

1. Como el operario de los Prerrequisitos (solo `ver` por defecto), ir al listado de servicios
   obligatorios.
2. **Esperado**: puede ver el listado y el detalle, pero no ve disponibles las acciones de
   registrar, editar ni eliminar.
3. Como administrador, otorgar al operario el permiso `editar` del módulo
   `servicios_obligatorios` (**no** `crear` ni `eliminar` — research.md R2, esas dos acciones no
   tienen efecto en la política RLS de este módulo).
4. **Esperado**: con `editar` otorgado, el operario ya puede registrar, editar y eliminar.

## Notas de validación no funcional

- **Auditoría** (constitución §2): tras cada alta/edición/eliminación de un servicio obligatorio,
  confirmar en `public.auditoria` la fila correspondiente (`accion` = `crear`/`editar`/
  `eliminar`).
- **Accesibilidad** (constitución §4): el formulario de captura/edición y el listado deben cumplir
  WCAG 2.1 AA.
- **RLS** (constitución §2, §4): confirmar, llamando directo al cliente Supabase (no vía UI), que
  un operario sin `editar` no puede insertar/editar/eliminar ni siquiera con las acciones `crear`/
  `eliminar` otorgadas por separado (research.md R2) — solo `editar` desbloquea escritura.
