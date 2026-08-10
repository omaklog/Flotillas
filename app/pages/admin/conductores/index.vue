<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Conductores</h1>
        <p class="text-metadata text-medium-emphasis mt-1">Conductores de tu flotilla.</p>
      </div>
      <v-btn
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nuevo-btn"
        to="/admin/conductores/nuevo"
      >
        Nuevo conductor
      </v-btn>
    </div>

    <v-alert v-if="conductores.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ conductores.error.value }}
    </v-alert>

    <v-checkbox
      v-model="mostrarInactivos"
      label="Mostrar inactivos"
      density="compact"
      hide-details
      class="mb-2 flex-grow-0"
      @update:model-value="onCambiarFiltro"
    />

    <CatalogosTablaCatalogo
      :items="conductores.registros.value"
      :cargando="conductores.cargando.value"
      :busqueda="busqueda"
      etiqueta-busqueda="Buscar por nombre o apellidos"
      mensaje-vacio="Sin conductores que mostrar."
      :colspan-vacio="4"
      test-id-prefix="conductores"
      @update:busqueda="onBuscar"
    >
      <template #encabezados>
        <th>Nombre</th>
        <th>Número de licencia</th>
        <th>Licencia</th>
        <th></th>
      </template>
      <template #fila="{ item }">
        <td>
          <NuxtLink
            :to="`/admin/conductores/${item.id}`"
            class="text-decoration-none text-primary"
          >
            <div class="font-weight-medium">{{ item.nombre }} {{ item.apellidos }}</div>
          </NuxtLink>
        </td>
        <td>{{ item.numero_licencia }}</td>
        <td>
          <v-chip
            :color="estadoLicencia(item.fecha_vencimiento_licencia).color"
            size="small"
            :data-testid="`licencia-badge-${item.id}`"
          >
            {{ estadoLicencia(item.fecha_vencimiento_licencia).texto }}
          </v-chip>
        </td>
        <td>
          <div class="d-flex align-center justify-end ga-1">
            <v-chip v-if="!item.activo" color="grey" size="small" variant="tonal">Inactivo</v-chip>
            <v-btn
              icon="mdi-delete-outline"
              size="small"
              variant="text"
              color="error"
              density="comfortable"
              data-testid="eliminar-btn"
              :aria-label="`Eliminar ${item.nombre} ${item.apellidos}`"
              @click="abrirEliminar(item)"
            />
          </div>
        </td>
      </template>
    </CatalogosTablaCatalogo>

    <CatalogosDialogoConfirmarEliminarCatalogo
      v-model="dialogoEliminarAbierto"
      etiqueta-entidad="conductor"
      :nombre="registroAEliminar ? `${registroAEliminar.nombre} ${registroAEliminar.apellidos}` : ''"
      :eliminando="eliminando"
      @confirmar="onConfirmarEliminar"
    />
  </div>
</template>

<script setup lang="ts">
import type { ConductorRow } from '~/composables/useConductores'

definePageMeta({ layout: 'admin' })

const UMBRAL_POR_VENCER_DIAS = 60
const MS_POR_DIA = 24 * 60 * 60 * 1000

const conductores = useConductores()

const busqueda = ref('')
const mostrarInactivos = ref(false)
const dialogoEliminarAbierto = ref(false)
const registroAEliminar = ref<ConductorRow | null>(null)
const eliminando = ref(false)

onMounted(() => {
  conductores.listar()
})

async function onBuscar(valor: string) {
  busqueda.value = valor
  await conductores.listar(valor, mostrarInactivos.value)
}

async function onCambiarFiltro() {
  await conductores.listar(busqueda.value, mostrarInactivos.value)
}

function abrirEliminar(item: ConductorRow) {
  registroAEliminar.value = item
  dialogoEliminarAbierto.value = true
}

async function onConfirmarEliminar() {
  if (!registroAEliminar.value) return
  eliminando.value = true
  try {
    await conductores.eliminar(registroAEliminar.value.id)
    await conductores.listar(busqueda.value, mostrarInactivos.value)
  } catch {
    // conductores.error ya tiene el mensaje mapeado (23503 → dependientes, visible en el
    // v-alert de arriba) — solo cerramos el diálogo para que quede visible.
  } finally {
    dialogoEliminarAbierto.value = false
    eliminando.value = false
  }
}

function estadoLicencia(fechaVencimiento: string): {
  texto: string
  color: 'success' | 'warning' | 'error'
} {
  const diasRestantes = Math.floor(
    (new Date(fechaVencimiento).getTime() - Date.now()) / MS_POR_DIA
  )
  if (diasRestantes < 0) return { texto: 'Vencida', color: 'error' }
  if (diasRestantes <= UMBRAL_POR_VENCER_DIAS) return { texto: 'Por vencer', color: 'warning' }
  return { texto: 'Vigente', color: 'success' }
}
</script>
