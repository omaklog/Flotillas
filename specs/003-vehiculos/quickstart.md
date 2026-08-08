# Quickstart: Vehículos

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado igual que en features anteriores (`supabase start`, `.env`
  configurado), con la migración nueva de esta feature aplicada (bucket `documentos` + triggers
  de auditoría — `data-model.md`, sección "Extensiones sobre el esquema actual").
- Un administrador activo de una empresa de prueba, con al menos un tipo de vehículo y (para el
  Escenario 2) una aseguradora ya en su catálogo (Catálogos Base, Feature 002 — si la empresa es
  la de siempre, ya tiene `ligero`/`pesado`/`mat_peligrosos` sembrados).
- Un archivo PDF de prueba de menos de 10 MB para los escenarios que suben póliza.
- Un operario activo de esa misma empresa, sin permiso `'editar'` en el módulo `vehiculos`
  (estado por defecto tras invitarlo — solo `'ver'`).

## Escenario 1 — Alta de vehículo sin póliza, y edición posterior (US-3.1, US-3.3)

1. Como administrador, ir a "Vehículos" → "Nuevo vehículo".
2. Completar marca, modelo, placa, tipo de vehículo (obligatorio) y el resto de campos, **sin**
   adjuntar póliza. Guardar.
3. **Esperado**: el vehículo aparece en el listado sin indicador de póliza (o con un estado "Sin
   póliza" explícito).
4. Abrir el vehículo, editar, adjuntar ahora un archivo PDF de póliza. Guardar.
5. **Esperado**: el vehículo queda con la póliza vigente; el listado ahora muestra su estado
   (vigente/por vencer/vencida) según la fecha de vencimiento capturada.

## Escenario 2 — Alta con póliza adjunta desde el inicio (US-3.1)

1. Repetir el alta del Escenario 1, pero esta vez adjuntando el PDF de prueba y una fecha de
   vencimiento **directamente en el formulario de alta**.
2. **Esperado**: el vehículo se crea con la póliza ya vigente en un solo flujo visible para el
   usuario (aunque internamente sean dos pasos — research.md, Decisión "Alta en dos pasos").
3. Intentar dar de alta un segundo vehículo con la **misma placa**.
4. **Esperado**: el formulario lo marca como duplicado antes de enviar.

## Escenario 3 — Reemplazo de póliza y su historial de versiones (US-3.3)

1. Sobre el vehículo del Escenario 2, editar y subir un **segundo** archivo de póliza (distinto
   al primero).
2. **Esperado**: el nuevo archivo queda como vigente.
3. Abrir el historial de versiones de póliza del vehículo.
4. **Esperado**: ambas versiones aparecen, ordenadas de más reciente a más antigua, cada una con
   fecha de subida, quién la subió y un enlace de descarga; solo la más reciente está marcada
   "Vigente". Descargar la versión anterior (no vigente) y confirmar que el archivo correcto se
   descarga.

## Escenario 4 — Baja y reactivación (US-3.4)

1. Sobre cualquier vehículo activo, usar "Dar de baja" **sin** capturar un motivo.
2. **Esperado**: el sistema bloquea la confirmación exigiendo el motivo.
3. Capturar un motivo y confirmar.
4. **Esperado**: el vehículo desaparece del listado por defecto.
5. Activar el control "Mostrar dados de baja".
6. **Esperado**: el vehículo vuelve a ser visible, distinguible de los activos.
7. Usar "Reactivar" sobre ese vehículo.
8. **Esperado**: vuelve a aparecer en el listado por defecto, sin el control de "Mostrar dados de
   baja" activo.

## Escenario 5 — Eliminación bloqueada y eliminación con limpieza de archivos (US-3.5)

1. Crear un vehículo nuevo (sin dependientes) con una póliza adjunta.
2. Intentar eliminarlo definitivamente.
3. **Esperado**: se elimina sin error; su historial de póliza (fila en `archivos` + objeto en
   Storage) también desaparece — confirmar directamente contra la base de datos/Storage que no
   quedó ningún registro huérfano (FR-016a, Clarifications sesión 2026-08-08).
4. Sobre otro vehículo, sembrar directo vía `service_role` una fila en `cargas_combustible` (o
   `mantenimientos`/`checklists`/`servicios_obligatorios`) que lo referencie — Combustible (004)
   no existe todavía, mismo patrón de "sembrar solo lo necesario" ya usado en tests de features
   anteriores.
5. Intentar eliminar ese vehículo.
6. **Esperado**: se rechaza con un mensaje claro ("No se puede eliminar: tiene cargas de
   combustible registradas" o equivalente según la tabla sembrada), y el vehículo sigue existiendo
   con su historial intacto.

## Escenario 6 — Asignación de permisos al vehículo (US-3.6)

1. Con al menos un tipo de permiso ya en el catálogo de la empresa (Catálogos Base, Feature 002),
   abrir un vehículo y su pestaña de permisos asignados.
2. Asignar uno con una fecha de vencimiento.
3. **Esperado**: aparece en la lista de permisos aplicables del vehículo con esa fecha.
4. Intentar asignar el mismo permiso de nuevo.
5. **Esperado**: se rechaza como duplicado.
6. Editar la fecha de vencimiento de la asignación ya creada.
7. **Esperado**: el cambio se refleja de inmediato.
8. Quitar la asignación.
9. **Esperado**: desaparece de la lista del vehículo; el permiso sigue existiendo en el catálogo
   general de Catálogos Base.

## Escenario 7 — Operario de solo lectura (RLS negativo, constitución §4)

1. Iniciar sesión como el operario (permiso por defecto: solo `'ver'` en el módulo `vehiculos`).
2. Confirmar que puede ver el listado, el detalle, el historial de póliza y los permisos
   asignados de los vehículos de su empresa.
3. Confirmar, llamando directo al cliente Supabase del operario (no vía UI), que un
   `insert`/`update`/`delete` contra `vehiculos`, `vehiculo_permisos` o un intento de subida a
   `documentos/poliza/{empresa_id}/...` son rechazados por RLS — no un éxito silencioso.

## Escenario 8 — Detalle de solo lectura y foto del vehículo (US-3.7, FR-022 a FR-025)

> Agregado en la ronda de `/speckit-clarify` del 2026-08-08, posterior a los Escenarios 1-7 —
> requiere las Fases 10-11 de `tasks.md` (T050-T064), todavía no implementadas al momento de
> escribir esto.

1. Desde el listado, hacer clic en un vehículo.
2. **Esperado**: se abre en modo solo lectura — ningún campo es editable, no hay botón "Guardar".
3. Usar la acción "Editar".
4. **Esperado**: se abre el formulario con los datos precargados (mismo formulario del Escenario
   1).
5. Adjuntar una foto (JPG) y guardar.
6. **Esperado**: regresa al detalle de solo lectura, mostrando la foto adjunta.
7. Volver a editar y reemplazar la foto por otra distinta. Guardar.
8. **Esperado**: el detalle muestra la nueva foto. Confirmar vía `service_role` que la fila
   anterior en `archivos` (`tipo = 'foto'`) y su objeto en Storage ya no existen — a diferencia de
   la póliza (Escenario 3), la foto no conserva historial.

## Notas de validación no funcional

- **Auditoría** (constitución §2): tras cada alta/edición/baja/reactivación/eliminación,
  confirmar en `public.auditoria` la fila correspondiente — especial atención a que dar de baja
  y reactivar generen `accion = 'desactivar'`/`'reactivar'` (no `'editar'` a secas), vía
  `private.audit_vehiculos()` (research.md R4).
- **Aislamiento de Storage** (FR-020, SC-007): con dos empresas de prueba, confirmar que un
  administrador de la empresa A no puede generar una URL firmada válida para un archivo de
  póliza de la empresa B, ni listar su carpeta.
- **Accesibilidad** (constitución §4): el formulario de alta/edición (incluida la zona de subida
  de archivo) y el listado deben cumplir WCAG 2.1 AA — mismo criterio ya aplicado en Catálogos
  Base.
