<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Combustible</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Historial de cargas de combustible de tu flotilla.
        </p>
      </div>
      <v-btn
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nueva-carga-btn"
        to="/admin/combustible/nuevo"
      >
        Nueva carga
      </v-btn>
    </div>

    <v-alert v-if="cargas.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ cargas.error.value }}
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
              v-model="filtros.proveedorId"
              label="Proveedor"
              :items="proveedores"
              item-title="nombre"
              item-value="id"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-proveedor"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select
              v-model="filtros.estado"
              label="Estado"
              :items="[
                { title: 'Activa', value: 'activo' },
                { title: 'Cancelada', value: 'cancelado' }
              ]"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-estado"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-skeleton-loader v-if="cargas.cargando.value" type="table" />

    <v-table v-else data-testid="combustible-tabla">
      <thead>
        <tr>
          <th>Vehículo</th>
          <th>Fecha</th>
          <th>Cantidad</th>
          <th>Costo total</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in itemsPaginados" :key="item.id">
          <td>
            <NuxtLink
              :to="`/admin/combustible/${item.id}`"
              class="text-decoration-none text-primary"
            >
              {{ item.vehiculos?.marca }} {{ item.vehiculos?.modelo }} — {{ item.vehiculos?.placa }}
            </NuxtLink>
          </td>
          <td>{{ formatearFecha(item.fecha) }}</td>
          <td>{{ item.cantidad }}</td>
          <td>{{ item.costo_total }}</td>
          <td>
            <v-chip
              :color="item.estado === 'cancelado' ? 'grey' : 'success'"
              size="small"
              :data-testid="`estado-${item.id}`"
            >
              {{ item.estado === 'cancelado' ? 'Cancelada' : 'Activa' }}
            </v-chip>
          </td>
        </tr>
        <tr v-if="cargas.registros.value.length === 0">
          <td colspan="5" class="text-center text-medium-emphasis">
            Sin cargas de combustible que mostrar.
          </td>
        </tr>
      </tbody>
    </v-table>

    <div
      v-if="!cargas.cargando.value && cargas.registros.value.length > 0"
      class="d-flex align-center justify-space-between flex-wrap ga-4 mt-4"
    >
      <div class="d-flex align-center ga-4">
        <p class="text-metadata text-medium-emphasis">
          Mostrando {{ inicioRango }} a {{ finRango }} de {{ cargas.registros.value.length }} registros
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
definePageMeta({ layout: 'admin' })

const cargas = useCargasCombustible()
const { listar: listarVehiculos, registros: vehiculosRegistros } = useVehiculos()
const { listar: listarProveedores, registros: proveedores } = useProveedores()

const filtros = reactive({
  vehiculoId: '' as string,
  fechaDesde: '' as string,
  fechaHasta: '' as string,
  proveedorId: '' as string,
  estado: '' as string
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
  await cargas.listar({
    vehiculoId: filtros.vehiculoId || undefined,
    fechaDesde: filtros.fechaDesde || undefined,
    fechaHasta: filtros.fechaHasta || undefined,
    proveedorId: filtros.proveedorId || undefined,
    estado: (filtros.estado || undefined) as 'activo' | 'cancelado' | undefined
  })
  paginaActual.value = 1
}

watch(filtros, cargar, { deep: true })

onMounted(async () => {
  await Promise.all([listarVehiculos(), listarProveedores(), cargar()])
})

const paginaActual = ref(1)
const itemsPorPagina = ref(10)

watch(itemsPorPagina, () => {
  paginaActual.value = 1
})

const totalPaginas = computed(() => Math.ceil(cargas.registros.value.length / itemsPorPagina.value))
const itemsPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * itemsPorPagina.value
  return cargas.registros.value.slice(inicio, inicio + itemsPorPagina.value)
})
const inicioRango = computed(() =>
  cargas.registros.value.length === 0 ? 0 : (paginaActual.value - 1) * itemsPorPagina.value + 1
)
const finRango = computed(() =>
  Math.min(paginaActual.value * itemsPorPagina.value, cargas.registros.value.length)
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
