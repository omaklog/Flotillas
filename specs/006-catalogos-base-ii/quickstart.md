# Quickstart: Catálogos Base II (Proveedores + Productos)

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado (`supabase start`, `.env` configurado), con la migración nueva de esta
  feature aplicada (`proveedores.activo`/`motivo_baja`, triggers de auditoría — `data-model.md`,
  sección "Extensiones sobre el esquema actual").
- Un administrador activo de una empresa de prueba.
- Un vehículo activo de esa empresa (Vehículos, 003) — para sembrar directo vía `service_role` una
  carga de combustible o un mantenimiento que referencie un proveedor/producto de prueba, ya que
  esta feature no construye la UI de Combustible/Mantenimiento.
- Un operario activo de esa misma empresa, sin permiso `editar` en los módulos
  `proveedores`/`productos` (estado por defecto — solo `ver`).

## Escenario 1 — Alta, búsqueda y edición de un proveedor (US-1)

1. Como administrador, ir a "Proveedores" → "Nuevo proveedor".
2. Capturar solo el nombre. Guardar.
3. **Esperado**: el proveedor aparece en el listado.
4. Buscar por ese nombre y luego por un fragmento de su RFC (si se capturó) — confirmar que ambos
   encuentran el registro.
5. Editarlo, agregar RFC y domicilio. Guardar.
6. **Esperado**: los cambios se reflejan.

## Escenario 2 — Desactivar y reactivar un proveedor (US-1)

1. Sobre el proveedor del Escenario 1, usar "Desactivar" **sin** capturar un motivo.
2. **Esperado**: el sistema bloquea la confirmación.
3. Capturar un motivo y confirmar.
4. **Esperado**: el proveedor desaparece del listado por defecto.
5. Activar "Mostrar inactivos".
6. **Esperado**: el proveedor vuelve a ser visible, distinguible de los activos (chip "Inactivo").
7. Usar "Reactivar".
8. **Esperado**: vuelve a aparecer en el listado por defecto.

## Escenario 3 — Eliminación de proveedor bloqueada por dependientes (US-1)

1. Sobre otro proveedor, sembrar directo vía `service_role` una fila en `cargas_combustible` (o
   `mantenimientos`) que lo referencie (usando el vehículo de prueba de los Prerrequisitos y un
   producto de tipo combustible sembrado igual).
2. Intentar eliminar ese proveedor.
3. **Esperado**: se rechaza con un mensaje claro, y el proveedor sigue existiendo.

## Escenario 4 — Alta, filtro por tipo, y edición de un producto (US-2)

1. Como administrador, ir a "Productos" → "Nuevo producto".
2. Dar de alta un producto de tipo "Combustible" con unidad "litro". Guardar.
3. Dar de alta un segundo producto de tipo "Refacción".
4. **Esperado**: ambos aparecen en el listado.
5. Filtrar por tipo "Combustible".
6. **Esperado**: solo el primer producto aparece.
7. Editar el producto de tipo "Combustible" (sin registros asociados todavía) y cambiar su tipo a
   "Consumible". Guardar.
8. **Esperado**: el cambio se guarda sin restricción — el producto todavía no tiene registros
   asociados.

## Escenario 5 — Bloqueo del campo tipo tras tener registros asociados (US-2)

1. Sembrar directo vía `service_role` una carga de combustible (o un detalle de mantenimiento) que
   referencie el producto del Escenario 4.
2. Abrir la edición de ese producto.
3. **Esperado**: el campo tipo aparece deshabilitado, con una explicación visible de por qué; el
   resto de los campos (nombre, unidad) siguen editables.

## Escenario 6 — Eliminación de producto bloqueada por dependientes (US-2)

1. Sobre el mismo producto del Escenario 5 (ya con un registro asociado sembrado).
2. Intentar eliminarlo.
3. **Esperado**: se rechaza con un mensaje claro, y el producto sigue existiendo.

## Escenario 7 — Operario de solo lectura (RLS negativo, constitución §4)

1. Iniciar sesión como el operario (permiso por defecto: solo `ver` en `proveedores` y
   `productos`).
2. Confirmar que puede ver ambos listados.
3. Confirmar, llamando directo al cliente Supabase del operario (no vía UI), que un
   `insert`/`update`/`delete` contra `proveedores` o `productos` es rechazado por RLS.
4. Otorgar `editar` explícitamente en `proveedores` (no en `productos`) a ese operario.
5. **Esperado**: ahora puede escribir en `proveedores`, pero sigue bloqueado en `productos`.

## Notas de validación no funcional

- **Auditoría** (constitución §2): tras cada alta/edición/desactivación/reactivación/eliminación
  de un proveedor, confirmar en `public.auditoria` la fila correspondiente — especial atención a
  que desactivar y reactivar generen `accion = 'desactivar'`/`'reactivar'` (no `'editar'` a secas,
  vía `private.audit_empresas_usuarios()`). Para productos, confirmar `accion =
  'crear'`/`'editar'`/`'eliminar'` vía `private.audit_catalogo()`.
- **Accesibilidad** (constitución §4): los formularios y listados de ambos catálogos deben cumplir
  WCAG 2.1 AA — mismo criterio ya aplicado en Catálogos Base y Vehículos/Conductores.
