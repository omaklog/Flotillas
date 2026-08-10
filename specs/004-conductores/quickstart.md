# Quickstart: Conductores

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado igual que en features anteriores (`supabase start`, `.env`
  configurado), con la migración nueva de esta feature aplicada (`motivo_baja` +
  `UNIQUE(empresa_id, numero_licencia)`, trigger de auditoría, políticas de `storage.objects`
  generalizadas, tabla `asignaciones_conductor_vehiculo` — `data-model.md`, sección "Extensiones
  sobre el esquema actual").
- Un administrador activo de una empresa de prueba.
- Un archivo PDF de prueba de menos de 10 MB para los escenarios que suben licencia.
- Un operario activo de esa misma empresa, sin permiso `'editar'` en el módulo `conductores`
  (estado por defecto tras invitarlo — solo `'ver'`).
- Para el Escenario 6: un vehículo ya existente en la empresa (Vehículos, Feature 003) — para
  sembrar directo vía `service_role` una fila en `asignaciones_conductor_vehiculo`, ya que esta
  feature no construye la UI para crearlas (Feature 005).

## Escenario 1 — Alta de conductor sin licencia, y edición posterior (US-1, US-4)

1. Como administrador, ir a "Conductores" → "Nuevo conductor".
2. Completar nombre, apellidos, número de licencia, tipo de licencia y fecha de vencimiento, sin
   adjuntar el archivo. Guardar.
3. **Esperado**: el conductor aparece en el listado sin indicador de licencia adjunta.
4. Abrir el conductor, editar, adjuntar ahora un archivo PDF de licencia. Guardar.
5. **Esperado**: el conductor queda con la licencia vigente; el listado ahora muestra su estado
   (vigente/por vencer/vencida) según la fecha de vencimiento capturada.

## Escenario 2 — Alta con licencia adjunta desde el inicio, y número de licencia duplicado (US-1)

1. Repetir el alta del Escenario 1, pero esta vez adjuntando el PDF de prueba directamente en el
   formulario de alta.
2. **Esperado**: el conductor se crea con la licencia ya vigente en un solo flujo visible para el
   usuario (aunque internamente sean dos pasos).
3. Intentar dar de alta un segundo conductor con el **mismo número de licencia**.
4. **Esperado**: el formulario lo marca como duplicado antes de enviar.

## Escenario 3 — Detalle de solo lectura y reemplazo de licencia con historial (US-3, US-4)

1. Abrir el conductor del Escenario 2 desde el listado.
2. **Esperado**: se abre en modo solo lectura — ningún campo es editable, no hay botón "Guardar".
3. Usar la acción "Editar", subir un **segundo** archivo de licencia (distinto al primero) y
   guardar.
4. **Esperado**: regresa al detalle; el nuevo archivo queda como vigente.
5. Abrir la sección de historial de licencia.
6. **Esperado**: ambas versiones aparecen en una tabla, ordenadas de más reciente a más antigua,
   cada una con fecha de subida, quién la subió, acciones "Ver" y "Descargar", y una etiqueta de
   estado — solo la más reciente como "Vigente", la otra como "Anterior". Descargar la versión
   anterior y confirmar que el archivo correcto se descarga; usar "Ver" sobre la vigente y
   confirmar que no se descarga automáticamente (previsualización).
7. Usar "Subir Nueva Licencia" directo desde esa misma sección (sin pasar por Editar), con un
   tercer archivo.
8. **Esperado**: el tercer archivo queda como vigente; las dos versiones anteriores pasan a
   "Anterior".

## Escenario 4 — Desactivación y reactivación (US-5)

1. Sobre cualquier conductor activo, usar "Desactivar" **sin** capturar un motivo.
2. **Esperado**: el sistema bloquea la confirmación exigiendo el motivo.
3. Capturar un motivo y confirmar.
4. **Esperado**: el conductor desaparece del listado por defecto.
5. Activar el control "Mostrar inactivos".
6. **Esperado**: el conductor vuelve a ser visible, distinguible de los activos.
7. Usar "Reactivar" sobre ese conductor.
8. **Esperado**: vuelve a aparecer en el listado por defecto, sin el control de "Mostrar
   inactivos" activo.

## Escenario 5 — Eliminación sin dependientes, con limpieza de archivos (US-6)

1. Crear un conductor nuevo (sin asignaciones) con una licencia adjunta.
2. Intentar eliminarlo definitivamente.
3. **Esperado**: se elimina sin error; su historial de licencia (filas en `archivos` + objetos en
   Storage) también desaparece — confirmar directamente contra la base de datos/Storage que no
   quedó ningún registro huérfano (FR-016a).

## Escenario 6 — Eliminación bloqueada por asignaciones (US-6, Clarifications sesión 2026-08-09)

1. Sobre otro conductor, sembrar directo vía `service_role` una fila en
   `asignaciones_conductor_vehiculo` que lo referencie (usando el vehículo de prueba de los
   Prerrequisitos) — Asignación Conductor-Vehículo (005) no existe todavía como feature con UI,
   mismo patrón de "sembrar solo lo necesario" ya usado en tests de features anteriores.
2. Intentar eliminar ese conductor.
3. **Esperado**: se rechaza con un mensaje claro ("No se puede eliminar: tiene asignaciones
   registradas"), y el conductor sigue existiendo con su historial intacto.

## Escenario 7 — Operario de solo lectura (RLS negativo, constitución §4)

1. Iniciar sesión como el operario (permiso por defecto: solo `'ver'` en el módulo
   `conductores`).
2. Confirmar que puede ver el listado, el detalle y el historial de licencia de los conductores de
   su empresa.
3. Confirmar, llamando directo al cliente Supabase del operario (no vía UI), que un
   `insert`/`update`/`delete` contra `conductores`, o un intento de subida a
   `documentos/licencia/{empresa_id}/...`, son rechazados por RLS — no un éxito silencioso.
4. Confirmar además que ese mismo operario **tampoco** puede subir a
   `documentos/poliza/{empresa_id}/...` (módulo `vehiculos`, no `conductores`) — valida que la
   generalización de las políticas de `storage.objects` (research.md R4) sigue aislando cada tipo
   de documento a su propio módulo, sin sobre-conceder acceso cruzado.

## Notas de validación no funcional

- **Auditoría** (constitución §2): tras cada alta/edición/desactivación/reactivación/eliminación,
  confirmar en `public.auditoria` la fila correspondiente — especial atención a que desactivar y
  reactivar generen `accion = 'desactivar'`/`'reactivar'` (no `'editar'` a secas), vía
  `private.audit_empresas_usuarios()` (research.md R3).
- **Aislamiento de Storage** (FR-017, SC-007): con dos empresas de prueba, confirmar que un
  administrador de la empresa A no puede generar una URL firmada válida para un archivo de
  licencia de la empresa B, ni listar su carpeta.
- **Accesibilidad** (constitución §4): el formulario de alta/edición (incluida la zona de subida
  de archivo) y el listado deben cumplir WCAG 2.1 AA — mismo criterio ya aplicado en Vehículos y
  Catálogos Base.
