-- =====================================================================
-- Corrige archivos_delete: la migración 20260808174129 (003-vehiculos)
-- reescribió esta política mirando la versión de initial_schema.sql
-- (rol = 'admin' a secas) sin notar que modulos_y_permisos.sql ya la
-- había refinado para aceptar tiene_permiso('archivos','eliminar') —
-- el resultado reemplazó ese chequeo por tiene_permiso('vehiculos',
-- 'editar') en vez de sumarlo, rompiendo el permiso granular genérico
-- de 'archivos' (detectado por tests/e2e/permisos.spec.ts T056: un
-- operario con SOLO 'archivos.eliminar' otorgado dejó de poder borrar).
-- Ambos caminos son legítimos y no se pisan: 'archivos.eliminar' cubre
-- cualquier archivo (conductor, mantenimiento, etc.), 'vehiculos.editar'
-- cubre específicamente la limpieza de pólizas al eliminar/editar un
-- vehículo (FR-016a) sin exigir un permiso adicional redundante.
-- =====================================================================

drop policy "archivos_delete" on public.archivos;
create policy "archivos_delete" on public.archivos for delete
  using (
    private.es_superusuario()
    or (
      empresa_id = private.empresa_id()
      and (
        private.rol() = 'admin'::rol_usuario
        or private.tiene_permiso('archivos', 'eliminar')
        or (entidad_tipo = 'vehiculo' and private.tiene_permiso('vehiculos', 'editar'))
      )
    )
  );
