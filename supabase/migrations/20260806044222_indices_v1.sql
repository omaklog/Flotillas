-- =====================================================================
-- Migración 4 — Índices (v1, orientados a simplicidad; escala esperada
-- 50-300 vehículos por empresa). Se aplica después de las migraciones
-- 1-3.
--   supabase migration new indices_v1
--
-- Decisiones tomadas (ver conversación):
--   - Sin pg_trgm/GIN todavía: empresa_id ya acota la tabla a un
--     subconjunto pequeño antes del ILIKE.
--   - Sin índices parciales por estado todavía.
--   - Sin particionar auditoria todavía.
--   - Optimización "(select private.empresa_id())" en políticas RLS
--     QUEDA PENDIENTE para una migración de performance posterior
--     (no se hace aquí, ver nota al final).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Índices sobre empresa_id (aislamiento de tenant) y demás FKs.
--    Se omiten los que ya quedan cubiertos por un índice UNIQUE
--    existente cuya columna izquierda es la misma (evita duplicados).
-- ---------------------------------------------------------------------

-- usuarios
create index idx_usuarios_empresa_id on public.usuarios (empresa_id);

-- aseguradoras (tipos_vehiculo y permisos ya cubiertos por su UNIQUE(empresa_id, clave))
create index idx_aseguradoras_empresa_id on public.aseguradoras (empresa_id);

-- proveedores
create index idx_proveedores_empresa_id on public.proveedores (empresa_id);

-- conductores
create index idx_conductores_empresa_id on public.conductores (empresa_id);
create index idx_conductores_licencia_archivo_id on public.conductores (licencia_archivo_id);

-- vehiculos
create index idx_vehiculos_empresa_id on public.vehiculos (empresa_id);
create index idx_vehiculos_tipo_vehiculo_id on public.vehiculos (tipo_vehiculo_id);
create index idx_vehiculos_aseguradora_id on public.vehiculos (aseguradora_id);
create index idx_vehiculos_poliza_archivo_id on public.vehiculos (poliza_archivo_id);

-- vehiculo_permisos (UNIQUE(vehiculo_id, permiso_id) ya cubre vehiculo_id)
create index idx_vehiculo_permisos_empresa_id on public.vehiculo_permisos (empresa_id);
create index idx_vehiculo_permisos_permiso_id on public.vehiculo_permisos (permiso_id);

-- productos
create index idx_productos_empresa_id on public.productos (empresa_id);

-- cargas_combustible
create index idx_cargas_combustible_empresa_id on public.cargas_combustible (empresa_id);
create index idx_cargas_combustible_proveedor_id on public.cargas_combustible (proveedor_id);
create index idx_cargas_combustible_producto_id on public.cargas_combustible (producto_id);
create index idx_cargas_combustible_creado_por on public.cargas_combustible (creado_por);
create index idx_cargas_combustible_factura_archivo_id on public.cargas_combustible (factura_archivo_id);

-- mantenimientos
create index idx_mantenimientos_empresa_id on public.mantenimientos (empresa_id);
create index idx_mantenimientos_proveedor_id on public.mantenimientos (proveedor_id);
create index idx_mantenimientos_creado_por on public.mantenimientos (creado_por);
create index idx_mantenimientos_factura_archivo_id on public.mantenimientos (factura_archivo_id);

-- mantenimiento_detalles
create index idx_mantenimiento_detalles_empresa_id on public.mantenimiento_detalles (empresa_id);
create index idx_mantenimiento_detalles_mantenimiento_id on public.mantenimiento_detalles (mantenimiento_id);
create index idx_mantenimiento_detalles_producto_id on public.mantenimiento_detalles (producto_id);

-- checklists
create index idx_checklists_empresa_id on public.checklists (empresa_id);
create index idx_checklists_tipo_vehiculo_id on public.checklists (tipo_vehiculo_id);
create index idx_checklists_responsable_id on public.checklists (responsable_id);

-- checklist_items
create index idx_checklist_items_empresa_id on public.checklist_items (empresa_id);
create index idx_checklist_items_checklist_id on public.checklist_items (checklist_id);

-- servicios_obligatorios
create index idx_servicios_obligatorios_empresa_id on public.servicios_obligatorios (empresa_id);
create index idx_servicios_obligatorios_archivo_id on public.servicios_obligatorios (archivo_id);

-- alertas
create index idx_alertas_empresa_id on public.alertas (empresa_id);
create index idx_alertas_entidad on public.alertas (entidad_tipo, entidad_id);

-- archivos
create index idx_archivos_empresa_id on public.archivos (empresa_id);
create index idx_archivos_entidad on public.archivos (entidad_tipo, entidad_id);
create index idx_archivos_subido_por on public.archivos (subido_por);

-- auditoria
create index idx_auditoria_empresa_id on public.auditoria (empresa_id);
create index idx_auditoria_usuario_id on public.auditoria (usuario_id);
create index idx_auditoria_entidad on public.auditoria (empresa_id, entidad, entidad_id, created_at desc);

-- usuario_permisos (UNIQUE(usuario_id, modulo_clave, accion) ya cubre usuario_id
-- y usuario_id+modulo_clave; falta empresa_id para el panel de administración)
create index idx_usuario_permisos_empresa_id on public.usuario_permisos (empresa_id);

-- ---------------------------------------------------------------------
-- 2. Compuestos para el patrón "historial por vehículo" (US-14, línea
--    de tiempo): WHERE empresa_id = X AND vehiculo_id = Y ORDER BY fecha DESC.
--    Sustituyen a los índices simples de vehiculo_id en estas 4 tablas.
-- ---------------------------------------------------------------------
create index idx_cargas_combustible_timeline on public.cargas_combustible (empresa_id, vehiculo_id, fecha desc);
create index idx_mantenimientos_timeline on public.mantenimientos (empresa_id, vehiculo_id, fecha desc);
create index idx_checklists_timeline on public.checklists (empresa_id, vehiculo_id, fecha desc);
create index idx_servicios_obligatorios_timeline on public.servicios_obligatorios (empresa_id, vehiculo_id, fecha_realizado desc);

-- ---------------------------------------------------------------------
-- 3. Índices para el cron de alertas de vencimiento (corre con
--    service_role, sin RLS, escaneando TODOS los tenants a la vez;
--    por eso NO llevan empresa_id como columna principal).
-- ---------------------------------------------------------------------
create index idx_vehiculos_fecha_vencimiento_poliza on public.vehiculos (fecha_vencimiento_poliza) where baja = false;
create index idx_conductores_fecha_vencimiento_licencia on public.conductores (fecha_vencimiento_licencia) where activo = true;
create index idx_vehiculo_permisos_fecha_vencimiento on public.vehiculo_permisos (fecha_vencimiento);
create index idx_servicios_obligatorios_fecha_vencimiento on public.servicios_obligatorios (fecha_vencimiento);

-- =====================================================================
-- Pendiente de refinar (deliberadamente pospuesto, no olvidado):
--   - Reescribir las políticas RLS de las migraciones 1-3 envolviendo
--     private.empresa_id() / private.rol() / private.tiene_permiso()
--     como "(select ...)" para que Postgres las cachee una vez por
--     consulta (initPlan) en vez de una vez por fila. Se hace en una
--     sola pasada, con datos reales de EXPLAIN ANALYZE en mano, no
--     antes.
--   - pg_trgm + índices GIN para búsqueda de texto, si algún tenant
--     crece mucho más de lo esperado (>> 300 vehículos/conductores).
--   - Índices parciales por estado='activo' en cargas_combustible y
--     mantenimientos, si los reportes se sienten lentos.
--   - Particionar auditoria por fecha, si el volumen de eventos lo
--     amerita más adelante.
-- =====================================================================
