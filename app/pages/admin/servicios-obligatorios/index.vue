<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Servicios Obligatorios</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Bitácora de cumplimiento normativo de tu flotilla.
        </p>
      </div>
      <v-btn
        v-if="puedeEscribir"
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nuevo-servicio-btn"
        to="/admin/servicios-obligatorios/nuevo"
      >
        Nuevo servicio
      </v-btn>
    </div>

    <v-alert v-if="servicios.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ servicios.error.value }}
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
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="filtros.tipo"
              label="Tipo de servicio"
              :items="tiposServicio"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-tipo"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="filtros.fechaDesde"
              label="Realizado desde"
              type="date"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-fecha-desde"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="filtros.fechaHasta"
              label="Realizado hasta"
              type="date"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-fecha-hasta"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-skeleton-loader v-if="servicios.cargando.value" type="table" />

    <v-table v-else data-testid="servicios-tabla">
      <thead>
        <tr>
          <th>Vehículo</th>
          <th>Tipo</th>
          <th>Realizado</th>
          <th>Vencimiento</th>
          <th>Vigencia</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in itemsPaginados" :key="item.id">
          <td>
            <NuxtLink
              :to="`/admin/servicios-obligatorios/${item.id}`"
              class="text-decoration-none text-primary"
            >
              {{ item.vehiculos?.marca }} {{ item.vehiculos?.modelo }} — {{ item.vehiculos?.placa }}
            </NuxtLink>
          </td>
          <td>{{ etiquetaTipo(item.tipo) }}</td>
          <td>{{ formatearFecha(item.fecha_realizado) }}</td>
          <td>{{ formatearFecha(item.fecha_vencimiento) }}</td>
          <td>
            <v-chip
              :color="estadoServicio(item.fecha_vencimiento).color"
              size="small"
              :data-testid="`vigencia-${item.id}`"
            >
              {{ estadoServicio(item.fecha_vencimiento).texto }}
            </v-chip>
          </td>
        </tr>
        <tr v-if="servicios.registros.value.length === 0">
          <td colspan="5" class="text-center text-medium-emphasis">
            Sin servicios obligatorios que mostrar.
          </td>
        </tr>
      </tbody>
    </v-table>

    <div
      v-if="!servicios.cargando.value && servicios.registros.value.length > 0"
      class="d-flex align-center justify-space-between flex-wrap ga-4 mt-4"
    >
      <div class="d-flex align-center ga-4">
        <p class="text-metadata text-medium-emphasis">
          Mostrando {{ inicioRango }} a {{ finRango }} de {{ servicios.registros.value.length }} registros
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
import { etiquetaTipo, estadoServicio, tiposServicio } from '~/utils/servicios-obligatorios'

definePageMeta({ layout: 'admin' })

const servicios = useServiciosObligatorios()
const { listar: listarVehiculos, registros: vehiculosRegistros } = useVehiculos()
const { tienePermiso } = usePermisos()

const puedeEscribir = computed(() => tienePermiso('servicios_obligatorios', 'editar'))

const filtros = reactive({
  vehiculoId: '' as string,
  tipo: '' as Database['public']['Enums']['tipo_servicio_obligatorio'] | '',
  fechaDesde: '' as string,
  fechaHasta: '' as string
})

const vehiculosOpciones = computed(() =>
  vehiculosRegistros.value.map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo} — ${v.placa}` }))
)

function formatearFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

async function cargar() {
  await servicios.listar({
    vehiculoId: filtros.vehiculoId || undefined,
    tipo: (filtros.tipo || undefined) as Database['public']['Enums']['tipo_servicio_obligatorio'] | undefined,
    fechaDesde: filtros.fechaDesde || undefined,
    fechaHasta: filtros.fechaHasta || undefined
  })
  paginaActual.value = 1
}

watch(filtros, cargar, { deep: true })

onMounted(async () => {
  await Promise.all([listarVehiculos(), cargar()])
})

const paginaActual = ref(1)
const itemsPorPagina = ref(10)

watch(itemsPorPagina, () => {
  paginaActual.value = 1
})

const totalPaginas = computed(() => Math.ceil(servicios.registros.value.length / itemsPorPagina.value))
const itemsPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * itemsPorPagina.value
  return servicios.registros.value.slice(inicio, inicio + itemsPorPagina.value)
})
const inicioRango = computed(() =>
  servicios.registros.value.length === 0 ? 0 : (paginaActual.value - 1) * itemsPorPagina.value + 1
)
const finRango = computed(() =>
  Math.min(paginaActual.value * itemsPorPagina.value, servicios.registros.value.length)
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
