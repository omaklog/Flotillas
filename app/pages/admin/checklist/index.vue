<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Checklist</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Historial de revisiones de seguridad de tu flotilla.
        </p>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          variant="outlined"
          prepend-icon="mdi-format-list-checks"
          data-testid="plantilla-btn"
          to="/admin/checklist/plantilla"
        >
          Plantilla
        </v-btn>
        <v-btn
          color="primary-container"
          prepend-icon="mdi-plus"
          data-testid="nuevo-checklist-btn"
          to="/admin/checklist/nuevo"
        >
          Nuevo checklist
        </v-btn>
      </div>
    </div>

    <v-alert v-if="checklists.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ checklists.error.value }}
    </v-alert>

    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6" md="3">
            <v-autocomplete
              v-model="filtros.vehiculoId"
              label="Vehículo"
              :items="vehiculosOpciones"
              item-title="label"
              item-value="id"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-vehiculo"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-text-field
              v-model="filtros.fechaDesde"
              label="Desde"
              type="date"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-fecha-desde"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-text-field
              v-model="filtros.fechaHasta"
              label="Hasta"
              type="date"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-fecha-hasta"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-autocomplete
              v-model="filtros.conductorId"
              label="Conductor"
              :items="conductoresOpciones"
              item-title="label"
              item-value="id"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-conductor"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select
              v-model="filtros.resultado"
              label="Resultado"
              :items="[
                { title: 'Aprobado', value: 'aprobado' },
                { title: 'Con observaciones', value: 'con_observaciones' }
              ]"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-resultado"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-skeleton-loader v-if="checklists.cargando.value" type="table" />

    <v-table v-else data-testid="checklist-tabla">
      <thead>
        <tr>
          <th>Vehículo</th>
          <th>Fecha</th>
          <th>Conductor</th>
          <th>Responsable</th>
          <th>Resultado</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in itemsPaginados" :key="item.id">
          <td>
            <NuxtLink
              :to="`/admin/checklist/${item.id}`"
              class="text-decoration-none text-primary"
            >
              {{ item.vehiculos?.marca }} {{ item.vehiculos?.modelo }} — {{ item.vehiculos?.placa }}
            </NuxtLink>
          </td>
          <td>{{ formatearFecha(item.fecha) }}</td>
          <td>{{ item.conductores ? `${item.conductores.nombre} ${item.conductores.apellidos}` : '—' }}</td>
          <td>{{ item.usuarios?.nombre ?? '—' }}</td>
          <td>
            <v-chip
              :color="item.resultado === 'aprobado' ? 'success' : 'warning'"
              size="small"
              :data-testid="`resultado-${item.id}`"
            >
              {{ item.resultado === 'aprobado' ? 'Aprobado' : 'Con observaciones' }}
            </v-chip>
          </td>
        </tr>
        <tr v-if="checklists.registros.value.length === 0">
          <td colspan="5" class="text-center text-medium-emphasis">
            Sin checklists que mostrar.
          </td>
        </tr>
      </tbody>
    </v-table>

    <div
      v-if="!checklists.cargando.value && checklists.registros.value.length > 0"
      class="d-flex align-center justify-space-between flex-wrap ga-4 mt-4"
    >
      <div class="d-flex align-center ga-4">
        <p class="text-metadata text-medium-emphasis">
          Mostrando {{ inicioRango }} a {{ finRango }} de {{ checklists.registros.value.length }} registros
        </p>
        <div class="d-flex align-center ga-1">
          <span class="text-metadata text-medium-emphasis">Filas por página:</span>
          <v-menu>
            <template #activator="{ props: activatorProps }">
              <button v-bind="activatorProps" type="button" class="app-selector-por-pagina text-metadata">
                {{ itemsPorPagina }}
                <v-icon icon="mdi-chevron-down" size="18" />
              </button>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="opcion in [5, 10, 20]"
                :key="opcion"
                :title="String(opcion)"
                :active="opcion === itemsPorPagina"
                @click="itemsPorPagina = opcion"
              />
            </v-list>
          </v-menu>
        </div>
      </div>
      <v-pagination
        v-if="totalPaginas > 1"
        v-model="paginaActual"
        :length="totalPaginas"
        density="comfortable"
        total-visible="5"
        variant="text"
        active-color="primary"
        rounded="lg"
        class="app-pagination"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

const checklists = useChecklists()
const { listar: listarVehiculos, registros: vehiculosRegistros } = useVehiculos()
const { listar: listarConductores, registros: conductoresRegistros } = useConductores()

const filtros = reactive({
  vehiculoId: '' as string,
  fechaDesde: '' as string,
  fechaHasta: '' as string,
  conductorId: '' as string,
  resultado: '' as string
})

const vehiculosOpciones = computed(() =>
  vehiculosRegistros.value.map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo} — ${v.placa}` }))
)
const conductoresOpciones = computed(() =>
  conductoresRegistros.value.map((c) => ({ id: c.id, label: `${c.nombre} ${c.apellidos}` }))
)

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

async function cargar() {
  await checklists.listar({
    vehiculoId: filtros.vehiculoId || undefined,
    fechaDesde: filtros.fechaDesde || undefined,
    fechaHasta: filtros.fechaHasta || undefined,
    conductorId: filtros.conductorId || undefined,
    resultado: (filtros.resultado || undefined) as Database['public']['Enums']['resultado_checklist'] | undefined
  })
  paginaActual.value = 1
}

watch(filtros, cargar, { deep: true })

onMounted(async () => {
  await Promise.all([listarVehiculos(), listarConductores(), cargar()])
})

const paginaActual = ref(1)
const itemsPorPagina = ref(10)

watch(itemsPorPagina, () => {
  paginaActual.value = 1
})

const totalPaginas = computed(() => Math.ceil(checklists.registros.value.length / itemsPorPagina.value))
const itemsPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * itemsPorPagina.value
  return checklists.registros.value.slice(inicio, inicio + itemsPorPagina.value)
})
const inicioRango = computed(() =>
  checklists.registros.value.length === 0 ? 0 : (paginaActual.value - 1) * itemsPorPagina.value + 1
)
const finRango = computed(() =>
  Math.min(paginaActual.value * itemsPorPagina.value, checklists.registros.value.length)
)
</script>

<style scoped>
.app-pagination :deep(.v-pagination__item--is-active .v-btn) {
  background-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.app-selector-por-pagina {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  padding: 0;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}
</style>
