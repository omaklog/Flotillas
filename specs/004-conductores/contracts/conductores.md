# Contrato: Conductores

Igual que Vehículos (`contracts/vehiculos.md` de 003), sin `server/api/` nuevos: toda operación
pasa por `useSupabaseClient()` directo, protegida por RLS (`data-model.md`, research.md R7).
`empresa_id` siempre sale de la sesión activa (`useAuth().usuario.value.empresa_id`), nunca
capturado por el usuario ni tomado de la URL.

## Conductor — CRUD base

**Listar / buscar** —
`supabase.from('conductores').select('*').or('nombre.ilike."%texto%",apellidos.ilike."%texto%"').eq('activo', true).order('nombre')`
(el filtro `eq('activo', true)` se omite cuando el toggle "Mostrar inactivos" está activo —
FR-007). El texto de búsqueda MUST escaparse con el mismo mecanismo ya usado en
`useCatalogo.ts`/`useVehiculos.ts` (comillas dobles alrededor del valor) — mismo bug real ya
corregido en Catálogos Base, no reimplementar la lógica de escape.

**Alta, paso 1 (crea el conductor sin archivo)** —
`supabase.from('conductores').insert({ empresa_id, nombre, apellidos, ...resto, licencia_archivo_id: null }).select('id').single()`
Errores esperados: `23505` (unique_violation, `empresa_id, numero_licencia`) → "Ya existe un
conductor con ese número de licencia."

**Alta, paso 2 (solo si se adjuntó archivo — ver sección "Archivo de licencia" abajo)**: subir el
archivo, insertar la fila de `archivos`, y `update` de `conductores.licencia_archivo_id` con el id
recién creado. Si cualquiera de estos 3 pasos falla, el conductor del paso 1 permanece intacto sin
licencia — no se revierte (FR-005, mismo criterio que Vehículos FR-005).

**Editar** — `supabase.from('conductores').update({...campos}).eq('id', id)` — mismos campos que
el alta, mismo error `23505` posible si se cambia el número de licencia a uno duplicado.

**Eliminar (con limpieza — FR-016a)** — 3 pasos secuenciales, en este orden exacto (research.md
R7, idéntico a Vehículos research.md R5):
1. `supabase.from('conductores').delete().eq('id', id)` — si falla con `23503`
   (foreign_key_violation, referenciado por `asignaciones_conductor_vehiculo`), mostrar "No se
   puede eliminar: tiene asignaciones registradas" y **detenerse aquí** — no ejecutar los pasos
   2-3.
2. Si el paso 1 tuvo éxito: `supabase.from('archivos').delete().eq('entidad_tipo', 'conductor').eq('entidad_id', id)`.
3. `supabase.storage.from('documentos').remove([...rutas de esos archivos])` (las rutas se
   obtienen de un `select` previo, antes de borrar en el paso 2 — ver quickstart.md).

## Desactivación / Reactivación (US-5)

**Desactivar** — `supabase.from('conductores').update({ activo: false, motivo_baja: texto }).eq('id', id)`
El formulario MUST validar `texto` no vacío y ≤150 caracteres antes de enviar (FR-012); el
`CHECK` de la columna es el respaldo de base de datos.

**Reactivar** — `supabase.from('conductores').update({ activo: true }).eq('id', id)` —
`motivo_baja` no se limpia (queda como el motivo de la última desactivación, visible en el
historial de auditoría vía `private.audit_empresas_usuarios()`, no en un campo de UI de "razón
activa").

## Archivo de licencia (alta paso 2, reemplazo en edición — US-1/US-4)

**Subir un archivo nuevo** (mismo flujo para "adjuntar en el alta" y "reemplazar en edición"):
1. Validar tipo (`application/pdf`, `image/jpeg`, `image/png`) y tamaño (≤10 MB) con
   `validarArchivo()` de `app/utils/archivos.ts` (research.md R8, reutilizada tal cual) **antes**
   de subir — mensaje claro si no cumple, sin llegar a Storage (FR-004).
2. `supabase.storage.from('documentos').upload(`licencia/${empresaId}/${conductorId}/${nombreArchivoUnico(archivo.name)}`, archivo, { contentType: archivo.type })`
   — sin `upsert`: cada versión es un objeto nuevo (research.md R8).
3. `supabase.from('archivos').insert({ empresa_id, tipo: 'licencia', storage_path, entidad_tipo: 'conductor', entidad_id: conductorId, subido_por: usuarioId }).select('id').single()`.
4. `supabase.from('conductores').update({ licencia_archivo_id: nuevoArchivoId }).eq('id', conductorId)`.

El archivo anterior (si lo había) **no se toca** — sigue en Storage y en `archivos`, ya no
referenciado como vigente por `conductores.licencia_archivo_id` (FR-010).

**Listar historial de versiones** —
`supabase.from('archivos').select('*, usuarios(nombre)').eq('entidad_tipo', 'conductor').eq('entidad_id', conductorId).eq('tipo', 'licencia').order('created_at', { ascending: false })`
— el que coincide con `conductores.licencia_archivo_id` se marca "Vigente" en el cliente
(comparando ids), el resto "Anterior" — mismo patrón de tabla (columnas Versión/Fecha, Estado,
Subido por, Acciones) ya construido en `HistorialPoliza.vue` de Vehículos.

**Previsualizar ("Ver")** —
`supabase.storage.from('documentos').createSignedUrl(storage_path, 60)` (sin `download`) — abre en
pestaña nueva sin forzar descarga, mismo patrón que `verArchivo()` de Vehículos.

**Descargar** —
`supabase.storage.from('documentos').createSignedUrl(storage_path, 60, { download: nombreDescarga })`
— fuerza `Content-Disposition: attachment`, mismo patrón que `descargarArchivo()` de Vehículos.

**Subir nueva versión directo desde el historial (FR-011a)** — mismo flujo de "Subir un archivo
nuevo" arriba, invocado desde un diálogo en la propia sección de historial (no solo desde
Editar).

## Composable `useConductores.ts` — forma esperada (research.md R9)

Mismo shape de funciones que `useVehiculos.ts`, sin compartir código entre ambos composables:
`listar`, `crear`, `editar`, `adjuntarLicencia`, `desactivar`, `reactivar`, `eliminar`,
`listarHistorialLicencia`, `descargarArchivo`, `verArchivo`. Mapeo de errores
(`mapearErrorEscritura`): `23505` → "Ya existe un conductor con ese número de licencia.", `23503`
sobre `asignaciones_conductor_vehiculo` → "No se puede eliminar: tiene asignaciones registradas."
