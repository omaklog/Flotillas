# Contrato: Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos)

A diferencia de los contratos de la Feature 001 (`server/api/*`), esta feature no introduce
endpoints propios (research.md R5): toda operación de lectura/escritura pasa directo por
`useSupabaseClient()` desde `app/`, protegida por RLS (`data-model.md`). Este documento describe
ese contrato cliente↔base de datos por entidad — el equivalente funcional de un contrato de API
para este feature.

Convención común a las 3 entidades: `empresa_id` **nunca** se envía explícito desde el cliente en
`insert` — se resuelve del lado de la base de datos o, si el cliente lo omite, RLS rechaza la fila
si no coincide con la empresa del usuario (`with check (... empresa_id = private.empresa_id())`).
En la práctica, el cliente sí debe incluir `empresa_id: private.empresa_id()` obtenido de la
sesión activa (no hay un default de columna que lo derive), pero jamás un valor capturado por el
usuario o tomado de la URL.

## Tipos de Vehículo

**Listar / buscar** — `supabase.from('tipos_vehiculo').select('*').ilike('nombre', '%texto%').order('nombre')`
RLS ya filtra a la empresa del usuario; ver requiere permiso `ver` del módulo `tipos_vehiculo` (o
`admin`/`superusuario`).

**Crear** — `supabase.from('tipos_vehiculo').insert({ empresa_id, clave, nombre })`
Requiere `admin` o permiso `crear` del módulo. Errores esperados:
- `23505` (unique_violation, `empresa_id, clave`) → "Ya existe un tipo de vehículo con esa clave."
- `23514` (check_violation, formato de clave) → no debería ocurrir en uso normal: el formulario ya
  valida el patrón antes de enviar (FR-005); si llega, mismo mensaje que el 23505 de formato
  inválido genérico.

**Editar** — `supabase.from('tipos_vehiculo').update({ clave, nombre }).eq('id', id)`
Mismos errores que Crear. Requiere `admin` o permiso `editar`.

**Eliminar** — `supabase.from('tipos_vehiculo').delete().eq('id', id)`
Requiere `admin` o permiso `eliminar`. Error esperado:
- `23503` (foreign_key_violation, referenciado por `vehiculos.tipo_vehiculo_id` o
  `checklists.tipo_vehiculo_id`) → "No se puede eliminar: hay vehículos usando este tipo."
  (spec FR-010, decisión confirmada).

## Aseguradoras

**Listar / buscar** — `supabase.from('aseguradoras').select('*').or('razon_social.ilike.%texto%,rfc.ilike.%texto%').order('razon_social')`

**Crear** — `supabase.from('aseguradoras').insert({ empresa_id, razon_social, rfc })`
Sin validación de formato de `rfc` a nivel de base de datos (data-model.md). Sin `clave`, por lo
que no aplica el flujo de autogeneración/duplicado de FR-005/FR-006/FR-007.

**Editar** — `supabase.from('aseguradoras').update({ razon_social, rfc }).eq('id', id)`

**Eliminar** — `supabase.from('aseguradoras').delete().eq('id', id)`
Error esperado:
- `23503` (referenciado por `vehiculos.aseguradora_id`) → "No se puede eliminar: hay vehículos
  usando esta aseguradora."

## Tipos de Permiso

**Listar / buscar** — `supabase.from('permisos').select('*').or('nombre.ilike.%texto%,clave.ilike.%texto%').order('nombre')`

**Crear** — `supabase.from('permisos').insert({ empresa_id, clave, nombre, tipo })`
`tipo` MUST ser `'estatal'` o `'federal'` (enum `tipo_permiso`, ya existe). Mismos errores de
`clave` que Tipos de Vehículo.

**Editar** — `supabase.from('permisos').update({ clave, nombre, tipo }).eq('id', id)`

**Eliminar** — `supabase.from('permisos').delete().eq('id', id)`
Error esperado:
- `23503` (referenciado por `vehiculo_permisos.permiso_id`) → "No se puede eliminar: hay vehículos
  con este permiso asignado."

## Autogenerar clave (solo Tipos de Vehículo y Tipos de Permiso)

No es una llamada a la base de datos — es una función pura de cliente (research.md R7) que
transforma el valor actual del campo "Nombre" y rellena el campo "Clave", sin persistir nada hasta
que el formulario se envía. El usuario dispara la transformación con el botón "Autogenerar"; no
ocurre automáticamente al escribir.
