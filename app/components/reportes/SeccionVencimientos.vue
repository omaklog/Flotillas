<template>
  <div>
    <v-alert
      v-if="!puedeVer"
      type="info"
      variant="tonal"
      data-testid="venc-sin-permiso"
    >
      No tienes permiso para ver este reporte.
    </v-alert>

    <template v-else>
      <v-alert v-if="error" type="error" class="mb-4" data-testid="venc-error">
        {{ error }}
      </v-alert>

      <v-card class="app-card-shadow mb-4" variant="flat">
        <v-card-text>
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-btn
              size="small"
              variant="tonal"
              data-testid="venc-atajo-30dias"
              @click="aplicarAtajo(atajoUltimos30Dias())"
            >
              Últimos 30 días
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              data-testid="venc-atajo-mes-actual"
              @click="aplicarAtajo(atajoMesActual())"
            >
              Mes en curso
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              data-testid="venc-atajo-mes-anterior"
              @click="aplicarAtajo(atajoMesAnterior())"
            >
              Mes anterior
            </v-btn>
          </div>
          <v-row dense>
            <v-col cols="12" sm="6" md="4">
              <v-text-field
                v-model="filtros.desde"
                label="Desde"
                type="date"
                clearable
                hide-details
                density="compact"
                data-testid="venc-filtro-desde"
              />
            </v-col>
            <v-col cols="12" sm="6" md="4">
              <v-text-field
                v-model="filtros.hasta"
                label="Hasta"
                type="date"
                clearable
                hide-details
                density="compact"
                data-testid="venc-filtro-hasta"
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-skeleton-loader v-if="cargando" type="table" data-testid="venc-cargando" />

      <template v-else>
        <div v-if="puedeExportar" class="d-flex justify-end ga-2 mb-2">
          <v-btn
            variant="outlined"
            prepend-icon="mdi-file-excel"
            data-testid="venc-exportar-excel"
            :loading="exportando === 'excel'"
            @click="exportar('excel')"
          >
            Exportar a Excel
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-file-pdf-box"
            data-testid="venc-exportar-pdf"
            :loading="exportando === 'pdf'"
            @click="exportar('pdf')"
          >
            Exportar a PDF
          </v-btn>
        </div>

        <v-table data-testid="venc-tabla">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Entidad</th>
              <th>Vence</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(fila, indice) in filas" :key="indice">
              <td>{{ etiquetaTipo(fila.tipo) }}</td>
              <td>{{ fila.entidadLabel }}</td>
              <td>{{ fila.fechaVencimiento }}</td>
              <td>
                <v-chip size="small" :color="colorEstado(fila.estado)" variant="flat">
                  {{ etiquetaEstado(fila.estado) }}
                </v-chip>
              </td>
            </tr>
            <tr v-if="filas.length === 0">
              <td colspan="4" class="text-center text-medium-emphasis">
                Sin vencimientos en el rango seleccionado.
              </td>
            </tr>
          </tbody>
        </v-table>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { exportarExcel } from '~/utils/exportarExcel'
import { exportarPdf } from '~/utils/exportarPdf'
import type {
  RangoFechas,
  FilaVencimiento,
  TipoVencimiento,
  EstadoVencimiento
} from '~/composables/useReportes'

const { reporteVencimientos, atajoUltimos30Dias, atajoMesActual, atajoMesAnterior, registrarExportacion } =
  useReportes()
const { tienePermiso } = usePermisos()

const puedeVer = computed(
  () =>
    tienePermiso('reportes', 'ver') &&
    tienePermiso('vehiculos', 'ver') &&
    tienePermiso('conductores', 'ver')
)
const puedeExportar = computed(() => tienePermiso('reportes', 'exportar'))

const etiquetasTipo: Record<TipoVencimiento, string> = {
  licencia: 'Licencia',
  poliza: 'Póliza',
  permiso: 'Permiso'
}
function etiquetaTipo(tipo: TipoVencimiento): string {
  return etiquetasTipo[tipo]
}

const etiquetasEstado: Record<EstadoVencimiento, string> = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido'
}
function etiquetaEstado(estado: EstadoVencimiento): string {
  return etiquetasEstado[estado]
}

function colorEstado(estado: EstadoVencimiento): 'success' | 'warning' | 'error' {
  if (estado === 'vencido') return 'error'
  if (estado === 'por_vencer') return 'warning'
  return 'success'
}

const filtros = reactive<{ desde: string; hasta: string }>({ desde: '', hasta: '' })

function aplicarAtajo(rango: RangoFechas) {
  filtros.desde = rango.desde ?? ''
  filtros.hasta = rango.hasta ?? ''
}

const cargando = ref(false)
const error = ref<string | null>(null)
const filas = ref<FilaVencimiento[]>([])

// Guard contra respuestas fuera de orden — ver SeccionMantenimiento.vue. Más relevante aquí:
// este reporte hace 3 queries en paralelo (Promise.all) por llamada, así que dos `cargar()`
// en sucesión (ej. el `onMounted` inicial + un cambio de filtro inmediato) tienen aún más
// margen de resolver en un orden distinto al que se dispararon.
let idCargaActual = 0

async function cargar() {
  if (!puedeVer.value) return
  const idCarga = ++idCargaActual
  cargando.value = true
  error.value = null
  try {
    const resultado = await reporteVencimientos({
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined
    })
    if (idCarga !== idCargaActual) return
    filas.value = resultado
  } catch (err) {
    if (idCarga !== idCargaActual) return
    error.value = err instanceof Error ? err.message : 'No se pudo generar el reporte.'
  } finally {
    if (idCarga === idCargaActual) cargando.value = false
  }
}

watch(filtros, cargar, { deep: true })
onMounted(cargar)

const exportando = ref<'excel' | 'pdf' | null>(null)

const subtituloRango = computed(() => {
  const desde = filtros.desde || 'sin límite'
  const hasta = filtros.hasta || 'sin límite'
  return `Desde: ${desde} — Hasta: ${hasta}`
})

async function exportar(formato: 'excel' | 'pdf') {
  exportando.value = formato
  try {
    const columnas = ['Tipo', 'Entidad', 'Vence', 'Estado']
    const datos = filas.value.map((fila) => [
      etiquetaTipo(fila.tipo),
      fila.entidadLabel,
      fila.fechaVencimiento,
      etiquetaEstado(fila.estado)
    ])

    if (formato === 'excel') {
      await exportarExcel('reporte-vencimientos.xlsx', [{ titulo: 'Vencimientos', columnas, filas: datos }])
    } else {
      exportarPdf('reporte-vencimientos.pdf', 'Reporte de vencimientos', subtituloRango.value, [
        { titulo: 'Vencimientos', columnas, filas: datos }
      ])
    }

    await registrarExportacion({
      reporte: 'reporte_vencimientos',
      formato,
      filtros: { desde: filtros.desde || undefined, hasta: filtros.hasta || undefined }
    })
  } finally {
    exportando.value = null
  }
}
</script>
