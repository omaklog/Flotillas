# Contrato: Vehículos

Igual que Catálogos Base (`contracts/catalogos.md` de 002), sin `server/api/` nuevos: toda
operación pasa por `useSupabaseClient()` directo, protegida por RLS (`data-model.md`,
research.md R5). `empresa_id` siempre sale de la sesión activa (`useAuth().usuario.value.empresa_id`),
nunca capturado por el usuario ni tomado de la URL.

## Vehículo — CRUD base

**Listar / buscar** —
`supabase.from('vehiculos').select('*, tipos_vehiculo(nombre), aseguradoras(razon_social)').or('marca.ilike."%texto%",modelo.ilike."%texto%",placa.ilike."%texto%"').eq('baja', false).order('marca')`
(el filtro `eq('baja', false)` se omite cuando el toggle "Mostrar dados de baja" está activo —
FR-007). El texto de búsqueda MUST escaparse con el mismo mecanismo que `useCatalogo.ts` ya
implementa (comillas dobles alrededor del valor) — un texto con paréntesis o comas rompe la
sintaxis de `.or()` de PostgREST si no se escapa (bug real ya encontrado y corregido en Catálogos
Base; reusar esa lógica aquí, no reimplementarla).

**Alta, paso 1 (crea el vehículo sin archivo)** —
`supabase.from('vehiculos').insert({ empresa_id, marca, modelo, placa, ...resto, poliza_archivo_id: null }).select('id').single()`
Errores esperados: `23505` (unique_violation, `empresa_id, placa`) → "Ya existe un vehículo con
esa placa."

**Alta, paso 2 (solo si se adjuntó archivo — ver sección "Archivo de póliza" abajo)**: subir el
archivo, insertar la fila de `archivos`, y `update` de `vehiculos.poliza_archivo_id` con el id
recién creado. Si cualquiera de estos 3 pasos falla, el vehículo del paso 1 permanece intacto sin
póliza — no se revierte (FR-005, decisión confirmada de `spec.md`).

**Editar** — `supabase.from('vehiculos').update({...campos}).eq('id', id)` — mismos campos que el
alta, mismo error `23505` posible si se cambia la placa a una duplicada.

**Eliminar (con limpieza — FR-016a)** — 3 pasos secuenciales, en este orden exacto
(research.md R5):
1. `supabase.from('vehiculos').delete().eq('id', id)` — si falla con `23503`
   (foreign_key_violation, referenciado por `cargas_combustible`/`mantenimientos`/`checklists`/
   `servicios_obligatorios`), mostrar "No se puede eliminar: tiene &lt;entidad&gt; registrados" y
   **detenerse aquí** — no ejecutar los pasos 2-3.
2. Si el paso 1 tuvo éxito: `supabase.from('archivos').delete().eq('entidad_tipo', 'vehiculo').eq('entidad_id', id)`.
3. `supabase.storage.from('documentos').remove([...rutas de esos archivos])` (las rutas se
   obtienen del resultado del `select` implícito antes de borrar en el paso 2, o de un `select`
   previo — ver quickstart.md).

`vehiculo_permisos` no requiere limpieza manual: su FK a `vehiculos` sí tiene `ON DELETE CASCADE`
(data-model.md), se limpia sola en el paso 1.

## Baja / Reactivación (US-3.4)

**Dar de baja** — `supabase.from('vehiculos').update({ baja: true, motivo_baja: texto }).eq('id', id)`
El formulario MUST validar `texto` no vacío y ≤150 caracteres antes de enviar (FR-012); el
`CHECK` de la columna es el respaldo de base de datos.

**Reactivar** — `supabase.from('vehiculos').update({ baja: false }).eq('id', id)` — `motivo_baja`
no se limpia (queda como el motivo de la última baja, visible en el historial de auditoría vía
`private.audit_vehiculos()`, no en un campo de UI de "razón activa").

## Archivo de póliza (alta paso 2, reemplazo en edición — US-3.1/US-3.3)

**Subir un archivo nuevo** (mismo flujo para "adjuntar en el alta" y "reemplazar en edición"):
1. Validar tipo (`application/pdf`, `image/jpeg`, `image/png`) y tamaño (≤10 MB) **antes** de
   subir — mensaje claro si no cumple, sin llegar a Storage (FR-004).
2. `supabase.storage.from('documentos').upload(`poliza/${empresaId}/${vehiculoId}/${nombreArchivo}`, archivo, { contentType: archivo.type })`
   — sin `upsert`: cada versión es un objeto nuevo (research.md R6).
3. `supabase.from('archivos').insert({ empresa_id, tipo: 'poliza', storage_path, entidad_tipo: 'vehiculo', entidad_id: vehiculoId, subido_por: usuarioId }).select('id').single()`.
4. `supabase.from('vehiculos').update({ poliza_archivo_id: nuevoArchivoId }).eq('id', vehiculoId)`.

El archivo anterior (si lo había) **no se toca** — sigue en Storage y en `archivos`, ya no
referenciado como vigente por `vehiculos.poliza_archivo_id` (FR-010).

**Listar historial de versiones** —
`supabase.from('archivos').select('*, usuarios(nombre)').eq('entidad_tipo', 'vehiculo').eq('entidad_id', vehiculoId).eq('tipo', 'poliza').order('created_at', { ascending: false })`
— el que coincide con `vehiculos.poliza_archivo_id` se marca "Vigente" en el cliente (comparando
ids), no es un campo de la fila (data-model.md).

**Descargar una versión** —
`supabase.storage.from('documentos').createSignedUrl(storage_path, 60)` (bucket privado —
`getPublicUrl` no sirve; research.md R6). El enlace resultante se usa directo como `href` de
descarga, válido 60 segundos.

## Permisos asignados al vehículo (US-3.6)

**Listar asignados** —
`supabase.from('vehiculo_permisos').select('*, permisos(clave, nombre, tipo)').eq('vehiculo_id', vehiculoId)`

**Asignar** —
`supabase.from('vehiculo_permisos').insert({ empresa_id, vehiculo_id, permiso_id, fecha_vencimiento }).select('id').single()`
Error esperado: `23505` (unique_violation, `vehiculo_id, permiso_id`) → "Este permiso ya está
asignado a este vehículo." (FR-018).

**Editar fecha de vencimiento** —
`supabase.from('vehiculo_permisos').update({ fecha_vencimiento }).eq('id', asignacionId)`

**Quitar asignación** —
`supabase.from('vehiculo_permisos').delete().eq('id', asignacionId)` — sin bloqueo posible (no hay
ninguna tabla que referencie `vehiculo_permisos`), siempre procede.
