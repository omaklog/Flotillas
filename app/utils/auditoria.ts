/** Lista fija de las 20 tablas auditadas, con etiqueta en español (research.md R6) — no una
 * consulta `distinct` aparte. */
export const entidadesAuditadas: { title: string; value: string }[] = [
  { title: 'Empresas', value: 'empresas' },
  { title: 'Usuarios', value: 'usuarios' },
  { title: 'Tipos de Vehículo', value: 'tipos_vehiculo' },
  { title: 'Aseguradoras', value: 'aseguradoras' },
  { title: 'Proveedores', value: 'proveedores' },
  { title: 'Conductores', value: 'conductores' },
  { title: 'Catálogo de Permisos de Vehículo', value: 'permisos' },
  { title: 'Vehículos', value: 'vehiculos' },
  { title: 'Permisos Asignados a Vehículo', value: 'vehiculo_permisos' },
  { title: 'Productos', value: 'productos' },
  { title: 'Cargas de Combustible', value: 'cargas_combustible' },
  { title: 'Mantenimientos', value: 'mantenimientos' },
  { title: 'Líneas de Mantenimiento', value: 'mantenimiento_detalles' },
  { title: 'Checklists', value: 'checklists' },
  { title: 'Ítems de Checklist', value: 'checklist_items' },
  { title: 'Plantilla de Checklist', value: 'checklist_item_plantillas' },
  { title: 'Servicios Obligatorios', value: 'servicios_obligatorios' },
  { title: 'Archivos', value: 'archivos' },
  { title: 'Asignaciones de Conductor', value: 'asignaciones_conductor_vehiculo' },
  { title: 'Permisos de Usuario', value: 'usuario_permisos' }
]

export function etiquetaEntidad(entidad: string): string {
  return entidadesAuditadas.find((e) => e.value === entidad)?.title ?? entidad
}

const COLUMNAS_TECNICAS_EXCLUIDAS = new Set(['updated_at', 'created_at'])

type CampoDiff = { campo: string; antes: unknown; despues: unknown }

/** Comparación superficial campo por campo (research.md R7) — suficiente porque ninguna tabla
 * auditada tiene columnas anidadas más allá de su propio jsonb, que no se compara
 * recursivamente. Excluye columnas puramente técnicas de timestamp de fila (FR-009). */
export function calcularDiff(
  antes: Record<string, unknown> | null,
  despues: Record<string, unknown> | null
): CampoDiff[] {
  if (!antes || !despues) return []

  const campos = new Set([...Object.keys(antes), ...Object.keys(despues)])
  const diff: CampoDiff[] = []

  for (const campo of campos) {
    if (COLUMNAS_TECNICAS_EXCLUIDAS.has(campo)) continue
    const valorAntes = antes[campo]
    const valorDespues = despues[campo]
    if (JSON.stringify(valorAntes) !== JSON.stringify(valorDespues)) {
      diff.push({ campo, antes: valorAntes, despues: valorDespues })
    }
  }

  return diff
}

export type { CampoDiff }
