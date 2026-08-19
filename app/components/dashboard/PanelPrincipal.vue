<template>
  <div>
    <h1 class="text-page-title mb-1">Dashboard</h1>
    <p class="text-body-main mb-6">Resumen general de la flotilla.</p>

    <v-alert v-if="error" type="error" class="mb-4" data-testid="dashboard-error">
      {{ error }}
    </v-alert>

    <v-row class="mb-2" data-testid="dashboard-kpis">
      <v-col cols="12" sm="6" md="3">
        <v-card class="app-card-shadow pa-4" variant="flat" data-testid="kpi-vehiculos-activos">
          <v-avatar color="primary" variant="tonal" size="40" class="mb-3">
            <v-icon icon="mdi-truck-outline" />
          </v-avatar>
          <p class="text-metadata text-medium-emphasis">Vehículos activos</p>
          <p class="text-page-title" data-testid="kpi-vehiculos-activos-valor">
            {{ cargando ? '—' : kpis.vehiculosActivos }}
          </p>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="app-card-shadow pa-4" variant="flat" data-testid="kpi-licencias-por-vencer">
          <v-avatar color="warning" variant="tonal" size="40" class="mb-3">
            <v-icon icon="mdi-card-account-details-outline" />
          </v-avatar>
          <p class="text-metadata text-medium-emphasis">Licencias por vencer (30 días)</p>
          <p class="text-page-title" data-testid="kpi-licencias-por-vencer-valor">
            {{ cargando ? '—' : kpis.licenciasPorVencer }}
          </p>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="app-card-shadow pa-4" variant="flat" data-testid="kpi-polizas-por-vencer">
          <v-avatar color="error" variant="tonal" size="40" class="mb-3">
            <v-icon icon="mdi-file-document-outline" />
          </v-avatar>
          <p class="text-metadata text-medium-emphasis">Pólizas por vencer (30 días)</p>
          <p class="text-page-title" data-testid="kpi-polizas-por-vencer-valor">
            {{ cargando ? '—' : kpis.polizasPorVencer }}
          </p>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="app-card-shadow pa-4" variant="flat" data-testid="kpi-checklists-sin-atender">
          <v-avatar color="secondary" variant="tonal" size="40" class="mb-3">
            <v-icon icon="mdi-clipboard-alert-outline" />
          </v-avatar>
          <p class="text-metadata text-medium-emphasis">Checklists con observaciones sin atender</p>
          <p class="text-page-title" data-testid="kpi-checklists-sin-atender-valor">
            {{ cargando ? '—' : kpis.checklistsSinAtender }}
          </p>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mb-2">
      <v-col cols="12" md="4">
        <v-card class="app-card-shadow pa-4 h-100" variant="flat" data-testid="grafica-mantenimiento">
          <p class="text-section-title">Mantenimiento por tipo</p>
          <p class="text-metadata text-medium-emphasis mb-4">Montos de los últimos 30 días.</p>
          <v-skeleton-loader v-if="cargando" type="image" />
          <template v-else>
            <Pie
              :data="graficaMantenimiento.datosGrafica"
              :options="opcionesPie"
              role="img"
              :aria-label="graficaMantenimiento.resumenAccesible"
            />
            <table class="app-tabla-accesible mt-4" data-testid="grafica-mantenimiento-tabla">
              <caption class="text-metadata text-medium-emphasis text-left mb-1">
                Valores de la gráfica
              </caption>
              <tbody>
                <tr v-for="fila in graficaMantenimiento.filas" :key="fila.etiqueta">
                  <th scope="row" class="text-body-main">
                    <span class="app-punto-color" :style="{ backgroundColor: fila.color }" />
                    {{ fila.etiqueta }}
                  </th>
                  <td class="text-body-main text-right">{{ formatearMoneda(fila.valor) }}</td>
                </tr>
              </tbody>
            </table>
          </template>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card class="app-card-shadow pa-4 h-100" variant="flat" data-testid="grafica-licencias-mes">
          <p class="text-section-title">Licencias por vencer (mes en curso)</p>
          <p class="text-metadata text-medium-emphasis mb-4">Del total de conductores activos.</p>
          <v-skeleton-loader v-if="cargando" type="image" />
          <template v-else>
            <Pie
              :data="graficaLicenciasMes.datosGrafica"
              :options="opcionesPie"
              role="img"
              :aria-label="graficaLicenciasMes.resumenAccesible"
            />
            <table class="app-tabla-accesible mt-4" data-testid="grafica-licencias-mes-tabla">
              <caption class="text-metadata text-medium-emphasis text-left mb-1">
                Valores de la gráfica
              </caption>
              <tbody>
                <tr v-for="fila in graficaLicenciasMes.filas" :key="fila.etiqueta">
                  <th scope="row" class="text-body-main">
                    <span class="app-punto-color" :style="{ backgroundColor: fila.color }" />
                    {{ fila.etiqueta }}
                  </th>
                  <td class="text-body-main text-right">{{ fila.valor }}</td>
                </tr>
              </tbody>
            </table>
          </template>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card class="app-card-shadow pa-4 h-100" variant="flat" data-testid="grafica-polizas-mes">
          <p class="text-section-title">Pólizas por vencer (mes en curso)</p>
          <p class="text-metadata text-medium-emphasis mb-4">Del total de vehículos activos.</p>
          <v-skeleton-loader v-if="cargando" type="image" />
          <template v-else>
            <Pie
              :data="graficaPolizasMes.datosGrafica"
              :options="opcionesPie"
              role="img"
              :aria-label="graficaPolizasMes.resumenAccesible"
            />
            <table class="app-tabla-accesible mt-4" data-testid="grafica-polizas-mes-tabla">
              <caption class="text-metadata text-medium-emphasis text-left mb-1">
                Valores de la gráfica
              </caption>
              <tbody>
                <tr v-for="fila in graficaPolizasMes.filas" :key="fila.etiqueta">
                  <th scope="row" class="text-body-main">
                    <span class="app-punto-color" :style="{ backgroundColor: fila.color }" />
                    {{ fila.etiqueta }}
                  </th>
                  <td class="text-body-main text-right">{{ fila.valor }}</td>
                </tr>
              </tbody>
            </table>
          </template>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="app-card-shadow pa-4" variant="flat" data-testid="cumplimiento-checklists">
      <p class="text-section-title">Cumplimiento de checklists por tipo de vehículo</p>
      <p class="text-metadata text-medium-emphasis mb-4">
        % aprobado vs. con observaciones, últimos 30 días.
      </p>
      <v-skeleton-loader v-if="cargando" type="list-item-three-line" />
      <p v-else-if="cumplimiento.length === 0" class="text-body-main text-medium-emphasis">
        Sin checklists en los últimos 30 días.
      </p>
      <div v-else>
        <div
          v-for="fila in cumplimiento"
          :key="fila.tipoVehiculo"
          class="mb-4"
          :data-testid="`cumplimiento-fila-${fila.tipoVehiculo}`"
        >
          <div class="d-flex justify-space-between align-baseline mb-1">
            <span class="text-body-main">{{ fila.tipoVehiculo }}</span>
            <span class="text-metadata text-medium-emphasis">
              {{ fila.porcentajeAprobado }}% aprobado · {{ fila.porcentajeConObservaciones }}% con
              observaciones ({{ fila.total }} checklists)
            </span>
          </div>
          <div class="app-barra-cumplimiento" role="img" :aria-label="fila.resumenAccesible">
            <div
              class="app-barra-cumplimiento__segmento"
              style="background-color: rgb(var(--v-theme-success))"
              :style="{ width: `${fila.porcentajeAprobado}%` }"
            />
            <div
              class="app-barra-cumplimiento__segmento"
              style="background-color: rgb(var(--v-theme-warning))"
              :style="{ width: `${fila.porcentajeConObservaciones}%` }"
            />
          </div>
        </div>
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { Pie } from 'vue-chartjs'

const COLOR_WARNING = '#fb8c00'
const COLOR_ERROR = '#ba1a1a'
const COLOR_SECONDARY = '#0b61a1'
const COLOR_NEUTRO = '#e1e3e4'

const dashboard = useDashboard()

const cargando = ref(true)
const error = ref<string | null>(null)

const kpis = reactive({
  vehiculosActivos: 0,
  licenciasPorVencer: 0,
  polizasPorVencer: 0,
  checklistsSinAtender: 0
})

const mantenimientoPorTipo = ref({ correctivo: 0, preventivo: 0 })
const licenciasMes = ref({ porVencer: 0, totalActivos: 0 })
const polizasMes = ref({ porVencer: 0, totalActivos: 0 })
const cumplimientoBruto = ref<{ tipoVehiculo: string; aprobados: number; conObservaciones: number }[]>([])

const opcionesPie = { responsive: true, maintainAspectRatio: true }

function formatearMoneda(valor: number): string {
  return valor.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

type FilaGrafica = { etiqueta: string; valor: number; color: string }

function armarGraficaDosSlices(filas: FilaGrafica[], resumenAccesible: string) {
  return {
    filas,
    resumenAccesible,
    datosGrafica: {
      labels: filas.map((f) => f.etiqueta),
      datasets: [
        {
          data: filas.map((f) => f.valor),
          backgroundColor: filas.map((f) => f.color)
        }
      ]
    }
  }
}

const graficaMantenimiento = computed(() =>
  armarGraficaDosSlices(
    [
      { etiqueta: 'Correctivo', valor: mantenimientoPorTipo.value.correctivo, color: COLOR_WARNING },
      { etiqueta: 'Preventivo', valor: mantenimientoPorTipo.value.preventivo, color: COLOR_SECONDARY }
    ],
    `Correctivo: ${formatearMoneda(mantenimientoPorTipo.value.correctivo)}. Preventivo: ${formatearMoneda(mantenimientoPorTipo.value.preventivo)}.`
  )
)

const graficaLicenciasMes = computed(() => {
  const resto = Math.max(licenciasMes.value.totalActivos - licenciasMes.value.porVencer, 0)
  return armarGraficaDosSlices(
    [
      { etiqueta: 'Por vencer este mes', valor: licenciasMes.value.porVencer, color: COLOR_WARNING },
      { etiqueta: 'Resto de la flota', valor: resto, color: COLOR_NEUTRO }
    ],
    `${licenciasMes.value.porVencer} de ${licenciasMes.value.totalActivos} conductores activos tienen licencia por vencer este mes.`
  )
})

const graficaPolizasMes = computed(() => {
  const resto = Math.max(polizasMes.value.totalActivos - polizasMes.value.porVencer, 0)
  return armarGraficaDosSlices(
    [
      { etiqueta: 'Por vencer este mes', valor: polizasMes.value.porVencer, color: COLOR_ERROR },
      { etiqueta: 'Resto de la flota', valor: resto, color: COLOR_NEUTRO }
    ],
    `${polizasMes.value.porVencer} de ${polizasMes.value.totalActivos} vehículos activos tienen póliza por vencer este mes.`
  )
})

const cumplimiento = computed(() =>
  cumplimientoBruto.value.map((fila) => {
    const total = fila.aprobados + fila.conObservaciones
    const porcentajeAprobado = total === 0 ? 0 : Math.round((fila.aprobados / total) * 100)
    const porcentajeConObservaciones = total === 0 ? 0 : 100 - porcentajeAprobado
    return {
      ...fila,
      total,
      porcentajeAprobado,
      porcentajeConObservaciones,
      resumenAccesible: `${fila.tipoVehiculo}: ${porcentajeAprobado}% aprobado, ${porcentajeConObservaciones}% con observaciones, de ${total} checklists.`
    }
  })
)

async function cargar() {
  cargando.value = true
  error.value = null
  try {
    const [
      vehiculosActivos,
      licenciasPorVencer,
      polizasPorVencer,
      checklistsSinAtender,
      montosMantenimiento,
      licenciasMesActual,
      polizasMesActual,
      cumplimientoChecklists
    ] = await Promise.all([
      dashboard.contarVehiculosActivos(),
      dashboard.contarLicenciasPorVencer(),
      dashboard.contarPolizasPorVencer(),
      dashboard.contarChecklistsSinAtender(),
      dashboard.montosMantenimientoPorTipo(),
      dashboard.licenciasPorVencerMesActual(),
      dashboard.polizasPorVencerMesActual(),
      dashboard.cumplimientoChecklistsPorTipoVehiculo()
    ])
    kpis.vehiculosActivos = vehiculosActivos
    kpis.licenciasPorVencer = licenciasPorVencer
    kpis.polizasPorVencer = polizasPorVencer
    kpis.checklistsSinAtender = checklistsSinAtender
    mantenimientoPorTipo.value = montosMantenimiento
    licenciasMes.value = licenciasMesActual
    polizasMes.value = polizasMesActual
    cumplimientoBruto.value = cumplimientoChecklists
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'No se pudo cargar el dashboard.'
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)
</script>

<style scoped>
.app-tabla-accesible {
  width: 100%;
  border-collapse: collapse;
}

.app-tabla-accesible th {
  font-weight: 400;
  text-align: left;
}

.app-punto-color {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
}

.app-barra-cumplimiento {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-variant));
}

.app-barra-cumplimiento__segmento {
  height: 100%;
}
</style>
