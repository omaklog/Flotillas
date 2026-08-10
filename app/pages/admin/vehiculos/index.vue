<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Vehículos</h1>
        <p class="text-metadata text-medium-emphasis mt-1">Flotilla de vehículos de tu empresa.</p>
      </div>
      <v-btn
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nuevo-btn"
        to="/admin/vehiculos/nuevo"
      >
        Nuevo vehículo
      </v-btn>
    </div>

    <v-alert v-if="vehiculos.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ vehiculos.error.value }}
    </v-alert>

    <v-checkbox
      v-model="mostrarBaja"
      label="Mostrar dados de baja"
      density="compact"
      hide-details
      class="mb-2 flex-grow-0"
      @update:model-value="onCambiarFiltro"
    />

    <CatalogosTablaCatalogo
      :items="vehiculos.registros.value"
      :cargando="vehiculos.cargando.value"
      :busqueda="busqueda"
      etiqueta-busqueda="Buscar por marca, modelo o placa"
      mensaje-vacio="Sin vehículos que mostrar."
      :colspan-vacio="5"
      test-id-prefix="vehiculos"
      @update:busqueda="onBuscar"
    >
      <template #encabezados>
        <th>Marca / Modelo</th>
        <th>Placa</th>
        <th>Tipo</th>
        <th>Póliza</th>
        <th></th>
      </template>
      <template #fila="{ item }">
        <td>
          <NuxtLink :to="`/admin/vehiculos/${item.id}`" class="text-decoration-none text-primary">
            <div class="font-weight-medium">{{ item.marca }}</div>
            <div class="text-metadata text-medium-emphasis">{{ item.modelo }}</div>
          </NuxtLink>
        </td>
        <td>{{ item.placa }}</td>
        <td>{{ item.tipos_vehiculo?.nombre ?? '—' }}</td>
        <td>
          <v-chip
            :color="estadoPoliza(item.fecha_vencimiento_poliza).color"
            size="small"
            :data-testid="`poliza-badge-${item.id}`"
          >
            {{ estadoPoliza(item.fecha_vencimiento_poliza).texto }}
          </v-chip>
        </td>
        <td>
          <div class="d-flex align-center justify-end ga-1">
            <v-chip v-if="item.baja" color="grey" size="small" variant="tonal">Baja</v-chip>
            <v-chip
              v-if="!vehiculosConConductor.has(item.id)"
              color="warning"
              size="small"
              variant="tonal"
              :data-testid="`sin-conductor-badge-${item.id}`"
            >
              Sin conductor
            </v-chip>
            <v-btn
              icon="mdi-delete-outline"
              size="small"
              variant="text"
              color="error"
              density="comfortable"
              data-testid="eliminar-btn"
              :aria-label="`Eliminar ${item.marca} ${item.modelo}`"
              @click="abrirEliminar(item)"
            />
          </div>
        </td>
      </template>
    </CatalogosTablaCatalogo>

    <CatalogosDialogoConfirmarEliminarCatalogo
      v-model="dialogoEliminarAbierto"
      etiqueta-entidad="vehículo"
      :nombre="registroAEliminar ? `${registroAEliminar.marca} ${registroAEliminar.modelo}` : ''"
      :eliminando="eliminando"
      @confirmar="onConfirmarEliminar"
    />
  </div>
</template>

<script setup lang="ts">
import type { VehiculoListado } from '~/composables/useVehiculos'

definePageMeta({ layout: 'admin' })

const UMBRAL_POR_VENCER_DIAS = 60
const MS_POR_DIA = 24 * 60 * 60 * 1000

const vehiculos = useVehiculos()
const { listarVehiculosConAsignacionActiva } = useAsignaciones()

const busqueda = ref('')
const mostrarBaja = ref(false)
const dialogoEliminarAbierto = ref(false)
const registroAEliminar = ref<VehiculoListado | null>(null)
const eliminando = ref(false)
// Indicador "Sin conductor" (FR-013): dos consultas cruzadas en el cliente, no un `select`
// anidado de PostgREST con filtro embebido (research.md R5 de 005-asignacion-conductor-vehiculo).
const vehiculosConConductor = ref<Set<string>>(new Set())

async function actualizarIndicadorConductor() {
  const ids = vehiculos.registros.value.map((v) => v.id)
  const activos = await listarVehiculosConAsignacionActiva(ids)
  vehiculosConConductor.value = new Set(activos)
}

onMounted(async () => {
  await vehiculos.listar()
  await actualizarIndicadorConductor()
})

async function onBuscar(valor: string) {
  busqueda.value = valor
  await vehiculos.listar(valor, mostrarBaja.value)
  await actualizarIndicadorConductor()
}

async function onCambiarFiltro() {
  await vehiculos.listar(busqueda.value, mostrarBaja.value)
  await actualizarIndicadorConductor()
}

function abrirEliminar(item: VehiculoListado) {
  registroAEliminar.value = item
  dialogoEliminarAbierto.value = true
}

async function onConfirmarEliminar() {
  if (!registroAEliminar.value) return
  eliminando.value = true
  try {
    await vehiculos.eliminar(registroAEliminar.value.id)
    await vehiculos.listar(busqueda.value, mostrarBaja.value)
    await actualizarIndicadorConductor()
  } catch {
    // vehiculos.error ya tiene el mensaje mapeado (23503 → dependientes, visible en el
    // v-alert de arriba) — solo cerramos el diálogo para que quede visible.
  } finally {
    dialogoEliminarAbierto.value = false
    eliminando.value = false
  }
}

function estadoPoliza(fechaVencimiento: string | null): {
  texto: string
  color: 'success' | 'warning' | 'error' | 'grey'
} {
  if (!fechaVencimiento) return { texto: 'Sin póliza', color: 'grey' }

  const diasRestantes = Math.floor(
    (new Date(fechaVencimiento).getTime() - Date.now()) / MS_POR_DIA
  )
  if (diasRestantes < 0) return { texto: 'Vencida', color: 'error' }
  if (diasRestantes <= UMBRAL_POR_VENCER_DIAS) return { texto: 'Por vencer', color: 'warning' }
  return { texto: 'Vigente', color: 'success' }
}
</script>
