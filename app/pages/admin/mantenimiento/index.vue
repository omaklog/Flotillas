<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Mantenimiento</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Historial de mantenimiento correctivo y preventivo de tu flotilla.
        </p>
      </div>
      <v-btn
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nueva-orden-btn"
        to="/admin/mantenimiento/nuevo"
      >
        Nueva orden
      </v-btn>
    </div>

    <v-alert v-if="ordenes.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ ordenes.error.value }}
    </v-alert>

    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6" md="2">
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
            <v-select
              v-model="filtros.tipo"
              label="Tipo"
              :items="[
                { title: 'Correctivo', value: 'correctivo' },
                { title: 'Preventivo', value: 'preventivo' }
              ]"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-tipo"
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

    <v-skeleton-loader v-if="ordenes.cargando.value" type="table" />

    <v-table v-else data-testid="mantenimiento-tabla">
      <thead>
        <tr>
          <th>Vehículo</th>
          <th>Tipo</th>
          <th>Fecha</th>
          <th>Costo total</th>
          <th>Estado</th>
          <th>Líneas</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in itemsPaginados" :key="item.id">
          <td>
            <NuxtLink
              :to="`/admin/mantenimiento/${item.id}`"
              class="text-decoration-none text-primary"
            >
              {{ item.vehiculos?.marca }} {{ item.vehiculos?.modelo }} — {{ item.vehiculos?.placa }}
            </NuxtLink>
          </td>
          <td>{{ item.tipo === 'correctivo' ? 'Correctivo' : 'Preventivo' }}</td>
          <td>{{ formatearFecha(item.fecha) }}</td>
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
          <td :data-testid="`num-lineas-${item.id}`">{{ item.mantenimiento_detalles?.[0]?.count ?? 0 }}</td>
        </tr>
        <tr v-if="ordenes.registros.value.length === 0">
          <td colspan="6" class="text-center text-medium-emphasis">
            Sin órdenes de mantenimiento que mostrar.
          </td>
        </tr>
      </tbody>
    </v-table>

    <div
      v-if="!ordenes.cargando.value && ordenes.registros.value.length > 0"
      class="d-flex align-center justify-space-between flex-wrap ga-4 mt-4"
    >
      <div class="d-flex align-center ga-4">
        <p class="text-metadata text-medium-emphasis">
          Mostrando {{ inicioRango }} a {{ finRango }} de {{ ordenes.registros.value.length }} registros
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

const ordenes = useMantenimientos()
const { listar: listarVehiculos, registros: vehiculosRegistros } = useVehiculos()
const { listar: listarProveedores, registros: proveedores } = useProveedores()

const filtros = reactive({
  vehiculoId: '' as string,
  tipo: '' as string,
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
  await ordenes.listar({
    vehiculoId: filtros.vehiculoId || undefined,
    tipo: (filtros.tipo || undefined) as 'correctivo' | 'preventivo' | undefined,
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

const totalPaginas = computed(() => Math.ceil(ordenes.registros.value.length / itemsPorPagina.value))
const itemsPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * itemsPorPagina.value
  return ordenes.registros.value.slice(inicio, inicio + itemsPorPagina.value)
})
const inicioRango = computed(() =>
  ordenes.registros.value.length === 0 ? 0 : (paginaActual.value - 1) * itemsPorPagina.value + 1
)
const finRango = computed(() =>
  Math.min(paginaActual.value * itemsPorPagina.value, ordenes.registros.value.length)
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
