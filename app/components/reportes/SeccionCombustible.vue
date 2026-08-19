<template>
  <div>
    <v-alert
      v-if="!puedeVer"
      type="info"
      variant="tonal"
      data-testid="comb-sin-permiso"
    >
      No tienes permiso para ver este reporte.
    </v-alert>

    <template v-else>
      <v-alert v-if="error" type="error" class="mb-4" data-testid="comb-error">
        {{ error }}
      </v-alert>

      <v-card class="app-card-shadow mb-4" variant="flat">
        <v-card-text>
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-btn
              size="small"
              variant="tonal"
              data-testid="comb-atajo-30dias"
              @click="aplicarAtajo(atajoUltimos30Dias())"
            >
              Últimos 30 días
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              data-testid="comb-atajo-mes-actual"
              @click="aplicarAtajo(atajoMesActual())"
            >
              Mes en curso
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              data-testid="comb-atajo-mes-anterior"
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
                data-testid="comb-filtro-desde"
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
                data-testid="comb-filtro-hasta"
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
                data-testid="comb-filtro-vehiculo"
              />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-skeleton-loader v-if="cargando" type="card" data-testid="comb-cargando" />

      <template v-else>
        <v-row class="mb-4" dense>
          <v-col cols="12" sm="6">
            <v-card class="app-card-shadow" variant="flat">
              <v-card-text>
                <p class="text-metadata text-medium-emphasis">Total {{ etiquetaUnidad }}</p>
                <p class="text-h5" data-testid="comb-total-cantidad">
                  {{ formatearNumero(reporte.total.cantidad) }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6">
            <v-card class="app-card-shadow" variant="flat">
              <v-card-text>
                <p class="text-metadata text-medium-emphasis">Costo total</p>
                <p class="text-h5" data-testid="comb-total-costo">
                  {{ formatearMoneda(reporte.total.costo) }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <div v-if="puedeExportar" class="d-flex justify-end ga-2 mb-2">
          <v-btn
            variant="outlined"
            prepend-icon="mdi-file-excel"
            data-testid="comb-exportar-excel"
            :loading="exportando === 'excel'"
            @click="exportar('excel')"
          >
            Exportar a Excel
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-file-pdf-box"
            data-testid="comb-exportar-pdf"
            :loading="exportando === 'pdf'"
            @click="exportar('pdf')"
          >
            Exportar a PDF
          </v-btn>
        </div>

        <v-table class="mb-6" data-testid="comb-tabla-vehiculos">
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>{{ etiquetaUnidad }}</th>
              <th>Costo total</th>
              <th>Rendimiento promedio</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="vehiculo in reporte.porVehiculo" :key="vehiculo.vehiculoId">
              <td>{{ vehiculo.vehiculoLabel }}</td>
              <td>{{ formatearNumero(vehiculo.totalCantidad) }}</td>
              <td>{{ formatearMoneda(vehiculo.totalCosto) }}</td>
              <td>{{ formatearRendimiento(vehiculo.rendimientoPromedio) }}</td>
            </tr>
            <tr v-if="reporte.porVehiculo.length === 0">
              <td colspan="4" class="text-center text-medium-emphasis">
                Sin cargas de combustible en el rango seleccionado.
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-table data-testid="comb-tabla-cargas">
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>Fecha</th>
              <th>Odómetro</th>
              <th>{{ etiquetaUnidad }}</th>
              <th>Costo</th>
              <th>Rendimiento</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="vehiculo in reporte.porVehiculo" :key="vehiculo.vehiculoId">
              <tr v-for="carga in vehiculo.cargas" :key="`${vehiculo.vehiculoId}-${carga.fecha}-${carga.odometro}`">
                <td>{{ vehiculo.vehiculoLabel }}</td>
                <td>{{ carga.fecha }}</td>
                <td>{{ carga.odometro }}</td>
                <td>{{ formatearNumero(carga.cantidad) }}</td>
                <td>{{ formatearMoneda(carga.costoTotal) }}</td>
                <td :data-testid="`comb-rendimiento-${carga.fecha}-${carga.odometro}`">
                  {{ formatearRendimiento(carga.rendimiento) }}
                </td>
              </tr>
            </template>
            <tr v-if="reporte.porVehiculo.length === 0">
              <td colspan="6" class="text-center text-medium-emphasis">
                Sin cargas de combustible en el rango seleccionado.
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
import type { RangoFechas, ReporteCombustible } from '~/composables/useReportes'

const {
  reporteCombustible,
  obtenerUnidadCombustible,
  atajoUltimos30Dias,
  atajoMesActual,
  atajoMesAnterior,
  registrarExportacion
} = useReportes()
const { listar: listarVehiculos, registros: vehiculosRegistros } = useVehiculos()
const { tienePermiso } = usePermisos()
const { usuario } = useAuth()

const puedeVer = computed(() => tienePermiso('reportes', 'ver') && tienePermiso('combustible', 'ver'))
const puedeExportar = computed(() => tienePermiso('reportes', 'exportar'))

const vehiculosOpciones = computed(() =>
  vehiculosRegistros.value.map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo} — ${v.placa}` }))
)

const unidad = ref<'litros' | 'galones'>('litros')
const etiquetaUnidad = computed(() => (unidad.value === 'galones' ? 'Galones' : 'Litros'))

function formatearNumero(valor: number): string {
  return valor.toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

function formatearRendimiento(valor: number | null): string {
  return valor === null ? 'N/D' : valor.toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

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
const reporte = ref<ReporteCombustible>({ total: { cantidad: 0, costo: 0 }, porVehiculo: [] })

// Guard contra respuestas fuera de orden — ver SeccionMantenimiento.vue.
let idCargaActual = 0

async function cargar() {
  if (!puedeVer.value) return
  const idCarga = ++idCargaActual
  cargando.value = true
  error.value = null
  try {
    const resultado = await reporteCombustible({
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
  if (usuario.value?.empresa_id) {
    unidad.value = await obtenerUnidadCombustible(usuario.value.empresa_id)
  }
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
    const columnasVehiculos = ['Vehículo', etiquetaUnidad.value, 'Costo total', 'Rendimiento promedio']
    const filasVehiculos = reporte.value.porVehiculo.map((v) => [
      v.vehiculoLabel,
      v.totalCantidad,
      v.totalCosto,
      v.rendimientoPromedio === null ? 'N/D' : v.rendimientoPromedio
    ])
    const columnasCargas = ['Vehículo', 'Fecha', 'Odómetro', etiquetaUnidad.value, 'Costo', 'Rendimiento']
    const filasCargas = reporte.value.porVehiculo.flatMap((v) =>
      v.cargas.map((c) => [
        v.vehiculoLabel,
        c.fecha,
        c.odometro,
        c.cantidad,
        c.costoTotal,
        c.rendimiento === null ? 'N/D' : c.rendimiento
      ])
    )

    if (formato === 'excel') {
      await exportarExcel('reporte-combustible.xlsx', [
        { titulo: 'Por vehículo', columnas: columnasVehiculos, filas: filasVehiculos },
        { titulo: 'Cargas', columnas: columnasCargas, filas: filasCargas }
      ])
    } else {
      exportarPdf('reporte-combustible.pdf', 'Reporte de combustible', subtituloRango.value, [
        { titulo: 'Por vehículo', columnas: columnasVehiculos, filas: filasVehiculos },
        { titulo: 'Cargas', columnas: columnasCargas, filas: filasCargas }
      ])
    }

    await registrarExportacion({
      reporte: 'reporte_combustible',
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
