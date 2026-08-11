import type { Database } from '~/types/database.types'

type TipoServicio = Database['public']['Enums']['tipo_servicio_obligatorio']

/** Catálogo fijo de 3 valores normativos, igual para todas las empresas (FR-001) — compartido
 * entre el formulario y el listado para no duplicar las etiquetas. */
export const tiposServicio: { title: string; value: TipoServicio }[] = [
  { title: 'Revisión físico-mecánica', value: 'revision_fisico_mecanica' },
  { title: 'Verificación ambiental', value: 'verificacion_ambiental' },
  { title: 'Renovación de aditamentos', value: 'renovacion_aditamentos' }
]

export function etiquetaTipo(tipo: TipoServicio): string {
  return tiposServicio.find((t) => t.value === tipo)?.title ?? tipo
}

const UMBRAL_POR_VENCER_DIAS = 60
const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Mismo umbral y colores que `estadoPoliza()` de `vehiculos/index.vue` (FR-009, research.md
 * R7) — la vigencia se calcula en el cliente, no se almacena. */
export function estadoServicio(fechaVencimiento: string): {
  texto: string
  color: 'success' | 'warning' | 'error'
} {
  const diasRestantes = Math.floor(
    (new Date(`${fechaVencimiento}T00:00:00`).getTime() - Date.now()) / MS_POR_DIA
  )
  if (diasRestantes < 0) return { texto: 'Vencido', color: 'error' }
  if (diasRestantes <= UMBRAL_POR_VENCER_DIAS) return { texto: 'Por vencer', color: 'warning' }
  return { texto: 'Vigente', color: 'success' }
}
