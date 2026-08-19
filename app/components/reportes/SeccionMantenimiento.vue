<template>
  <div>
    <v-alert
      v-if="!puedeVer"
      type="info"
      variant="tonal"
      data-testid="mant-sin-permiso"
    >
      No tienes permiso para ver este reporte.
    </v-alert>

    <template v-else>
      <v-alert v-if="error" type="error" class="mb-4" data-testid="mant-error">
        {{ error }}
      </v-alert>

      <v-card class="app-card-shadow mb-4" variant="flat">
        <v-card-text>
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-btn
              size="small"
              variant="tonal"
              data-testid="mant-atajo-30dias"
              @click="aplicarAtajo(atajoUltimos30Dias())"
            >
              Últimos 30 días
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              data-testid="mant-atajo-mes-actual"
              @click="aplicarAtajo(atajoMesActual())"
            >
              Mes en curso
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              data-testid="mant-atajo-mes-anterior"
              @click="aplicarAtajo(atajoMesAnterior())"
            >
              Mes anterior
            </v-btn>
          </div>
          <v-row dense>
            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="filtros.desde"
                label="Desde"
                type="date"
                clearable
                hide-details
                density="compact"
                data-testid="mant-filtro-desde"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-text-field
                v-model="filtros.hasta"
                label="Hasta"
                type="date"
                clearable
                hide-details
                density="compact"
                data-testid="mant-filtro-hasta"
              />
            </v-col>
            <v-col cols="12" sm="6" md="4">
              <v-autocomplete
                v-model="filtros.vehiculoId"
                label="Vehículo"
                :items="vehiculosOpciones"
                item-title="label"
                item-value="id"
                clearable
                hide-details
                density="compact"
                data-testid="mant-filtro-vehiculo"
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-skeleton-loader v-if="cargando" type="card" data-testid="mant-cargando" />

      <template v-else>
        <v-row class="mb-4" dense>
          <v-col cols="12" sm="4">
            <v-card class="app-card-shadow" variant="flat">
              <v-card-text>
                <p class="text-metadata text-medium-emphasis">Total general</p>
                <p class="text-h5" data-testid="mant-total-general">
                  {{ formatearMoneda(reporte.total) }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" sm="4">
            <v-card class="app-card-shadow" variant="flat">
              <v-card-text>
                <p class="text-metadata text-medium-emphasis">Correctivo</p>
                <p class="text-h5" data-testid="mant-total-correctivo">
                  {{ formatearMoneda(reporte.porTipo.correctivo) }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" sm="4">
            <v-card class="app-card-shadow" variant="flat">
              <v-card-text>
                <p class="text-metadata text-medium-emphasis">Preventivo</p>
                <p class="text-h5" data-testid="mant-total-preventivo">
                  {{ formatearMoneda(reporte.porTipo.preventivo) }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <div v-if="puedeExportar" class="d-flex justify-end ga-2 mb-2">
          <v-btn
            variant="outlined"
            prepend-icon="mdi-file-excel"
            data-testid="mant-exportar-excel"
            :loading="exportando === 'excel'"
            @click="exportar('excel')"
          >
            Exportar a Excel
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-file-pdf-box"
            data-testid="mant-exportar-pdf"
            :loading="exportando === 'pdf'"
            @click="exportar('pdf')"
          >
            Exportar a PDF
          </v-btn>
        </div>

        <v-table data-testid="mant-tabla">
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>Correctivo</th>
              <th>Preventivo</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fila in filasPorVehiculo" :key="fila.vehiculoId">
              <td>{{ fila.vehiculoLabel }}</td>
              <td>{{ formatearMoneda(fila.correctivo) }}</td>
              <td>{{ formatearMoneda(fila.preventivo) }}</td>
              <td>{{ formatearMoneda(fila.correctivo + fila.preventivo) }}</td>
            </tr>
            <tr v-if="filasPorVehiculo.length === 0">
              <td colspan="4" class="text-center text-medium-emphasis">
                Sin movimientos de mantenimiento en el rango seleccionado.
              </td>
            </tr>
          </tbody>
        </v-table>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatearMoneda } from '~/utils/moneda'
import { exportarExcel } from '~/utils/exportarExcel'
import { exportarPdf } from '~/utils/exportarPdf'
import type { RangoFechas, ReporteCostosMantenimiento } from '~/composables/useReportes'

const {
  reporteCostosMantenimiento,
  atajoUltimos30Dias,
  atajoMesActual,
  atajoMesAnterior,
  registrarExportacion
} = useReportes()
const { listar: listarVehiculos, registros: vehiculosRegistros } = useVehiculos()
const { tienePermiso } = usePermisos()

const puedeVer = computed(() => tienePermiso('reportes', 'ver') && tienePermiso('mantenimiento', 'ver'))
const puedeExportar = computed(() => tienePermiso('reportes', 'exportar'))

const vehiculosOpciones = computed(() =>
  vehiculosRegistros.value.map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo} — ${v.placa}` }))
)

const filtros = reactive<{ desde: string; hasta: string; vehiculoId: string }>({
  desde: '',
  hasta: '',
  vehiculoId: ''
})

function aplicarAtajo(rango: RangoFechas) {
  filtros.desde = rango.desde ?? ''
  filtros.hasta = rango.hasta ?? ''
}

const cargando = ref(false)
const error = ref<string | null>(null)
const reporte = ref<ReporteCostosMantenimiento>({
  total: 0,
  porTipo: { correctivo: 0, preventivo: 0 },
  porVehiculo: []
})

const filasPorVehiculo = computed(() => {
  const mapa = new Map<string, { vehiculoId: string; vehiculoLabel: string; correctivo: number; preventivo: number }>()
  for (const fila of reporte.value.porVehiculo) {
    const existente = mapa.get(fila.vehiculoId) ?? {
      vehiculoId: fila.vehiculoId,
      vehiculoLabel: fila.vehiculoLabel,
      correctivo: 0,
      preventivo: 0
    }
    existente[fila.tipo] = fila.costoTotal
    mapa.set(fila.vehiculoId, existente)
  }
  return Array.from(mapa.values())
})

// Guard contra respuestas fuera de orden: dos `cargar()` disparados en sucesión rápida (ej. el
// `onMounted` inicial + un cambio de filtro inmediato) pueden resolver en cualquier orden — sin
// esto, la respuesta más lenta podía pisar a la más reciente con datos obsoletos.
let idCargaActual = 0

async function cargar() {
  if (!puedeVer.value) return
  const idCarga = ++idCargaActual
  cargando.value = true
  error.value = null
  try {
    const resultado = await reporteCostosMantenimiento({
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      vehiculoId: filtros.vehiculoId || undefined
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

onMounted(async () => {
  if (!puedeVer.value) return
  await Promise.all([listarVehiculos(), cargar()])
})

const exportando = ref<'excel' | 'pdf' | null>(null)

const subtituloRango = computed(() => {
  const desde = filtros.desde || 'sin límite'
  const hasta = filtros.hasta || 'sin límite'
  return `Desde: ${desde} — Hasta: ${hasta}`
})

async function exportar(formato: 'excel' | 'pdf') {
  exportando.value = formato
  try {
    const columnas = ['Vehículo', 'Correctivo', 'Preventivo', 'Total']
    const filas = filasPorVehiculo.value.map((fila) => [
      fila.vehiculoLabel,
      fila.correctivo,
      fila.preventivo,
      fila.correctivo + fila.preventivo
    ])

    if (formato === 'excel') {
      await exportarExcel('reporte-costos-mantenimiento.xlsx', [
        { titulo: 'Por vehículo', columnas, filas }
      ])
    } else {
      exportarPdf(
        'reporte-costos-mantenimiento.pdf',
        'Reporte de costos de mantenimiento',
        subtituloRango.value,
        [{ titulo: 'Por vehículo', columnas, filas }]
      )
    }

    await registrarExportacion({
      reporte: 'reporte_mantenimiento',
      formato,
      filtros: {
        desde: filtros.desde || undefined,
        hasta: filtros.hasta || undefined,
        vehiculoId: filtros.vehiculoId || undefined
      }
    })
  } finally {
    exportando.value = null
  }
}
</script>
