# Quickstart: Foto del Conductor

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado (`supabase start`, `.env` configurado), con la migración nueva de esta
  feature aplicada (columna `foto_archivo_id`, enum `foto_conductor`, políticas de
  `storage.objects` regeneradas — `data-model.md`).
- Un administrador activo de una empresa de prueba.
- Un archivo JPG o PNG de prueba de menos de 10 MB.
- Un operario activo de esa misma empresa, con permiso `editar` otorgado únicamente en el módulo
  `conductores` (no en `vehiculos`).

## Escenario 1 — Alta con foto adjunta (FR-001)

1. Como administrador, ir a "Conductores" → "Nuevo conductor".
2. Completar los campos obligatorios y adjuntar la foto de prueba. Guardar.
3. **Esperado**: el conductor se crea; su detalle muestra la foto.

## Escenario 2 — Adjuntar foto después, editando (FR-001)

1. Abrir un conductor sin foto y editarlo.
2. Adjuntar una foto y guardar.
3. **Esperado**: el detalle ahora muestra la foto.

## Escenario 3 — Reemplazar la foto (FR-003, FR-004)

1. Sobre el conductor del Escenario 1, editar y adjuntar una foto distinta.
2. **Esperado**: el detalle muestra la nueva foto. Confirmar vía `service_role` que la fila
   anterior en `archivos` (`tipo = 'foto_conductor'`) y su objeto en Storage ya no existen — sin
   historial, a diferencia de la licencia.

## Escenario 4 — Archivo inválido rechazado (FR-002)

1. En el formulario de alta o edición, intentar adjuntar un PDF o una imagen mayor a 10 MB como
   foto.
2. **Esperado**: se rechaza antes de subirse, con un mensaje claro; el resto del formulario sigue
   disponible.

## Escenario 5 — Operario con permiso solo en `conductores` puede adjuntar la foto (FR-007, SC-003)

1. Iniciar sesión como el operario con `editar` otorgado únicamente en `conductores`.
2. Adjuntar o reemplazar la foto de un conductor.
3. **Esperado**: la operación se completa sin ningún rechazo de RLS — el mismo permiso que ya le
   permite editar los datos y la licencia del conductor alcanza también para su foto.

## Notas de validación no funcional

- **Aislamiento de Storage**: con dos empresas de prueba, confirmar que un administrador de la
  empresa A no puede generar una URL firmada válida para la foto de un conductor de la empresa B,
  ni listar su carpeta (`foto_conductor/{empresa_B}/...`).
- **Accesibilidad** (constitución §4): la zona de adjuntar foto debe cumplir WCAG 2.1 AA — mismo
  criterio ya aplicado en Vehículos y Conductores.
