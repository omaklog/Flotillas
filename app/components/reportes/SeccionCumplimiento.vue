<template>
  <div>
    <v-alert
      v-if="!puedeVer"
      type="info"
      variant="tonal"
      data-testid="cump-sin-permiso"
    >
      No tienes permiso para ver este reporte.
    </v-alert>

    <template v-else>
      <v-alert v-if="error" type="error" class="mb-4" data-testid="cump-error">
        {{ error }}
      </v-alert>

      <v-card class="app-card-shadow mb-4" variant="flat">
        <v-card-text>
          <p class="text-metadata text-medium-emphasis mb-2">
            El rango de fechas filtra los checklists; los servicios obligatorios siempre
            reflejan su vigencia al momento de generar el reporte.
          </p>
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-btn
              size="small"
              variant="tonal"
              data-testid="cump-atajo-30dias"
              @click="aplicarAtajo(atajoUltimos30Dias())"
            >
              Últimos 30 días
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              data-testid="cump-atajo-mes-actual"
              @click="aplicarAtajo(atajoMesActual())"
            >
              Mes en curso
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              data-testid="cump-atajo-mes-anterior"
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
                data-testid="cump-filtro-desde"
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
                data-testid="cump-filtro-hasta"
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-skeleton-loader v-if="cargando" type="table" data-testid="cump-cargando" />

      <template v-else>
        <div v-if="puedeExportar" class="d-flex justify-end ga-2 mb-2">
          <v-btn
            variant="outlined"
            prepend-icon="mdi-file-excel"
            data-testid="cump-exportar-excel"
            :loading="exportando === 'excel'"
            @click="exportar('excel')"
          >
            Exportar a Excel
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-file-pdf-box"
            data-testid="cump-exportar-pdf"
            :loading="exportando === 'pdf'"
            @click="exportar('pdf')"
          >
            Exportar a PDF
          </v-btn>
        </div>

        <v-table data-testid="cump-tabla">
          <thead>
            <tr>
              <th>Tipo de vehículo</th>
              <th>Checklists aprobados</th>
              <th>Servicios obligatorios vigentes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fila in filasCombinadas" :key="fila.tipoVehiculoId" :data-testid="`cump-fila-${fila.tipoVehiculoId}`">
              <td>{{ fila.tipoVehiculoNombre }}</td>
              <td>{{ formatearPorcentaje(fila.porcentajeAprobado) }}</td>
              <td>{{ formatearPorcentaje(fila.porcentajeVigente) }}</td>
            </tr>
            <tr v-if="filasCombinadas.length === 0">
              <td colspan="3" class="text-center text-medium-emphasis">
                Sin tipos de vehículo configurados.
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
import type { RangoFechas, ReporteCumplimiento } from '~/composables/useReportes'

const {
  reporteCumplimiento,
  atajoUltimos30Dias,
  atajoMesActual,
  atajoMesAnterior,
  registrarExportacion
} = useReportes()
const { tienePermiso } = usePermisos()

const puedeVer = computed(
  () =>
    tienePermiso('reportes', 'ver') &&
    tienePermiso('checklist', 'ver') &&
    tienePermiso('servicios_obligatorios', 'ver')
)
const puedeExportar = computed(() => tienePermiso('reportes', 'exportar'))

function formatearPorcentaje(valor: number | null): string {
  return valor === null ? 'Sin datos' : `${valor}%`
}

const filtros = reactive<{ desde: string; hasta: string }>({ desde: '', hasta: '' })

function aplicarAtajo(rango: RangoFechas) {
  filtros.desde = rango.desde ?? ''
  filtros.hasta = rango.hasta ?? ''
}

const cargando = ref(false)
const error = ref<string | null>(null)
const reporte = ref<ReporteCumplimiento>({ checklists: [], serviciosObligatorios: [] })

const filasCombinadas = computed(() =>
  reporte.value.checklists.map((checklist) => {
    const servicio = reporte.value.serviciosObligatorios.find(
      (s) => s.tipoVehiculoId === checklist.tipoVehiculoId
    )
    return {
      tipoVehiculoId: checklist.tipoVehiculoId,
      tipoVehiculoNombre: checklist.tipoVehiculoNombre,
      porcentajeAprobado: checklist.porcentajeAprobado,
      porcentajeVigente: servicio?.porcentajeVigente ?? null
    }
  })
)

// Guard contra respuestas fuera de orden — ver SeccionMantenimiento.vue.
let idCargaActual = 0

async function cargar() {
  if (!puedeVer.value) return
  const idCarga = ++idCargaActual
  cargando.value = true
  error.value = null
  try {
    const resultado = await reporteCumplimiento({
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined
    })
    if (idCarga !== idCargaActual) return
    reporte.value = resultado
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
  return `Checklists — Desde: ${desde} — Hasta: ${hasta}. Servicios obligatorios: vigencia actual.`
})

async function exportar(formato: 'excel' | 'pdf') {
  exportando.value = formato
  try {
    const columnas = ['Tipo de vehículo', 'Checklists aprobados', 'Servicios obligatorios vigentes']
    const datos = filasCombinadas.value.map((fila) => [
      fila.tipoVehiculoNombre,
      formatearPorcentaje(fila.porcentajeAprobado),
      formatearPorcentaje(fila.porcentajeVigente)
    ])

    if (formato === 'excel') {
      await exportarExcel('reporte-cumplimiento.xlsx', [{ titulo: 'Cumplimiento', columnas, filas: datos }])
    } else {
      exportarPdf('reporte-cumplimiento.pdf', 'Reporte de cumplimiento', subtituloRango.value, [
        { titulo: 'Cumplimiento', columnas, filas: datos }
      ])
    }

    await registrarExportacion({
      reporte: 'reporte_cumplimiento',
      formato,
      filtros: { desde: filtros.desde || undefined, hasta: filtros.hasta || undefined }
    })
  } finally {
    exportando.value = null
  }
}
</script>
