# Contrato: Foto del Conductor

Igual que el resto del proyecto, sin `server/api/` nuevos: toda operación pasa por
`useSupabaseClient()` directo, protegida por RLS (`data-model.md`, research.md R5).

## Adjuntar o reemplazar (alta paso 2 / edición — FR-001, FR-003, FR-004)

Calcado de `adjuntarFoto()` de `useVehiculos.ts` (Vehículos, contracts/vehiculos.md sección "Foto
del vehículo"), sobre `conductores` en vez de `vehiculos`:

1. Validar tipo (`image/jpeg`, `image/png`) y tamaño (≤10 MB) con `validarFoto()` de
   `app/utils/archivos.ts` (reutilizada tal cual) **antes** de subir (FR-002).
2. Leer `conductores.foto_archivo_id` actual (si lo había) — se guarda para borrarlo después,
   *no* antes.
3. `supabase.storage.from('documentos').upload(`foto_conductor/${empresaId}/${conductorId}/${nombreArchivoUnico(archivo.name)}`, archivo, { contentType: archivo.type })`.
4. `supabase.from('archivos').insert({ empresa_id, tipo: 'foto_conductor', storage_path, entidad_tipo: 'conductor', entidad_id: conductorId, subido_por: usuarioId }).select('id').single()`.
5. `supabase.from('conductores').update({ foto_archivo_id: nuevoArchivoId }).eq('id', conductorId)`.
6. **Solo si los pasos 3-5 tuvieron éxito** y ya había una foto anterior (capturada en el paso 2):
   `supabase.from('archivos').delete().eq('id', fotoAnteriorId)` +
   `supabase.storage.from('documentos').remove([rutaAnterior])` — en ese orden, para nunca perder
   la foto vigente si algún paso intermedio falla (FR-004).

## Mostrar la foto vigente (FR-006)

No hay historial que listar; si `conductores.foto_archivo_id` no es `null`, se resuelve una URL
firmada igual que el resto de los archivos del proyecto
(`supabase.storage.from('documentos').createSignedUrl(storage_path, 60)`), usada como `src` de
una `<v-img>` en el detalle de solo lectura del conductor.
