<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Alertas</h1>
        <p class="text-metadata mt-1">
          Vencimientos próximos y checklists con observaciones sin atender.
        </p>
      </div>
    </div>

    <v-alert v-if="alertas.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ alertas.error.value }}
    </v-alert>

    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="filtros.tipo"
              label="Tipo"
              :items="tipoOpciones"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-tipo"
            />
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="filtros.estado"
              label="Estado"
              :items="estadoOpciones"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-estado"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-skeleton-loader v-if="alertas.cargando.value" type="table" />

    <v-table v-else data-testid="alertas-tabla">
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Vence</th>
          <th>Estado</th>
          <th>Creada</th>
          <th v-if="puedeResolver" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in itemsPaginados" :key="item.id" :data-testid="`alertas-fila-${item.id}`">
          <td>{{ etiquetaTipo(item.tipo) }}</td>
          <td>{{ item.fecha_vencimiento ? formatearFecha(item.fecha_vencimiento) : '—' }}</td>
          <td>
            <v-chip size="small" :color="colorEstado(item.estado)" variant="flat">
              {{ etiquetaEstado(item.estado) }}
            </v-chip>
          </td>
          <td>{{ formatearFechaHora(item.created_at) }}</td>
          <td v-if="puedeResolver">
            <v-btn
              v-if="item.estado !== 'resuelta'"
              size="small"
              variant="tonal"
              :loading="resolviendo === item.id"
              :data-testid="`resolver-${item.id}`"
              @click="resolver(item.id)"
            >
              Marcar como resuelta
            </v-btn>
          </td>
        </tr>
        <tr v-if="alertas.registros.value.length === 0">
          <td :colspan="puedeResolver ? 5 : 4" class="text-center text-medium-emphasis">
            Sin alertas que mostrar.
          </td>
        </tr>
      </tbody>
    </v-table>

    <div
      v-if="!alertas.cargando.value && alertas.registros.value.length > 0"
      class="d-flex align-center justify-space-between flex-wrap ga-4 mt-4"
    >
      <div class="d-flex align-center ga-4">
        <p class="text-metadata">
          Mostrando {{ inicioRango }} a {{ finRango }} de {{ alertas.registros.value.length }} registros
        </p>
        <div class="d-flex align-center ga-1">
          <span class="text-metadata">Filas por página:</span>
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

type EstadoAlerta = Database['public']['Enums']['estado_alerta']

const alertas = useAlertas()
const { tienePermiso } = usePermisos()

const puedeResolver = computed(() => tienePermiso('alertas', 'aprobar'))

const tipoOpciones: { title: string; value: string }[] = [
  { title: 'Licencia', value: 'licencia' },
  { title: 'Póliza', value: 'poliza' },
  { title: 'Permiso de vehículo', value: 'permiso' },
  { title: 'Servicio obligatorio', value: 'servicio_obligatorio' },
  { title: 'Checklist', value: 'checklist' }
]

const estadoOpciones: { title: string; value: EstadoAlerta }[] = [
  { title: 'Pendiente', value: 'pendiente' },
  { title: 'Enviada', value: 'enviada' },
  { title: 'Resuelta', value: 'resuelta' }
]

function etiquetaTipo(tipo: string): string {
  return tipoOpciones.find((t) => t.value === tipo)?.title ?? tipo
}

function etiquetaEstado(estado: EstadoAlerta): string {
  return estadoOpciones.find((e) => e.value === estado)?.title ?? estado
}

function colorEstado(estado: EstadoAlerta): string {
  if (estado === 'resuelta') return 'success'
  if (estado === 'enviada') return 'warning'
  return 'error'
}

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatearFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

const filtros = reactive({
  tipo: '' as string,
  estado: '' as EstadoAlerta | ''
})

async function cargar() {
  await alertas.listar({
    tipo: filtros.tipo || undefined,
    estado: (filtros.estado || undefined) as EstadoAlerta | undefined
  })
  paginaActual.value = 1
}

watch(filtros, cargar, { deep: true })
onMounted(cargar)

const resolviendo = ref<string | null>(null)
async function resolver(id: string) {
  resolviendo.value = id
  try {
    await alertas.marcarResuelta(id)
    await cargar()
  } finally {
    resolviendo.value = null
  }
}

const paginaActual = ref(1)
const itemsPorPagina = ref(10)

watch(itemsPorPagina, () => {
  paginaActual.value = 1
})

const totalPaginas = computed(() => Math.ceil(alertas.registros.value.length / itemsPorPagina.value))
const itemsPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * itemsPorPagina.value
  return alertas.registros.value.slice(inicio, inicio + itemsPorPagina.value)
})
const inicioRango = computed(() =>
  alertas.registros.value.length === 0 ? 0 : (paginaActual.value - 1) * itemsPorPagina.value + 1
)
const finRango = computed(() =>
  Math.min(paginaActual.value * itemsPorPagina.value, alertas.registros.value.length)
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
