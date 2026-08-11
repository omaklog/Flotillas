<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Plantilla de Checklist</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Ítems de revisión de seguridad por tipo de vehículo.
        </p>
      </div>
      <v-btn
        v-if="puedeEditar && tipoVehiculoId"
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nuevo-btn"
        @click="abrirAlta"
      >
        Nuevo ítem
      </v-btn>
    </div>

    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <v-autocomplete
          v-model="tipoVehiculoId"
          label="Tipo de vehículo"
          :items="tiposVehiculo.registros.value"
          item-title="nombre"
          item-value="id"
          hide-details
          data-testid="tipo-vehiculo-select"
        />
      </v-card-text>
    </v-card>

    <v-alert v-if="plantilla.error.value" type="error" class="mb-4" data-testid="plantilla-error">
      {{ plantilla.error.value }}
    </v-alert>

    <template v-if="tipoVehiculoId">
      <v-skeleton-loader v-if="plantilla.cargando.value" type="table" />
      <v-table v-else data-testid="plantilla-tabla">
        <thead>
          <tr>
            <th>Orden</th>
            <th>Nombre</th>
            <th>Es crítico</th>
            <th v-if="puedeEditar"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in plantilla.registros.value" :key="item.id">
            <td>{{ item.orden }}</td>
            <td>{{ item.nombre_item }}</td>
            <td>{{ item.es_critico ? 'Sí' : 'No' }}</td>
            <td v-if="puedeEditar">
              <div class="d-flex justify-end ga-1">
                <v-btn
                  icon="mdi-pencil-outline"
                  size="small"
                  variant="text"
                  density="comfortable"
                  data-testid="editar-btn"
                  :aria-label="`Editar ${item.nombre_item}`"
                  @click="abrirEdicion(item)"
                />
                <v-btn
                  icon="mdi-delete-outline"
                  size="small"
                  variant="text"
                  color="error"
                  density="comfortable"
                  data-testid="eliminar-btn"
                  :aria-label="`Eliminar ${item.nombre_item}`"
                  @click="abrirEliminar(item)"
                />
              </div>
            </td>
          </tr>
          <tr v-if="plantilla.registros.value.length === 0">
            <td :colspan="puedeEditar ? 4 : 3" class="text-center text-medium-emphasis">
              Sin ítems de plantilla para este tipo de vehículo.
            </td>
          </tr>
        </tbody>
      </v-table>
    </template>

    <v-dialog v-model="dialogoFormularioAbierto" max-width="480">
      <v-card class="app-modal-shadow" variant="flat">
        <v-card-title class="text-section-title">
          {{ registroEditando ? 'Editar ítem' : 'Nuevo ítem' }}
        </v-card-title>
        <v-card-text>
          <ChecklistFormularioItemPlantilla
            v-if="tipoVehiculoId"
            :registro="registroEditando ?? undefined"
            :tipo-vehiculo-id="tipoVehiculoId"
            @guardado="onGuardado"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <CatalogosDialogoConfirmarEliminarCatalogo
      v-model="dialogoEliminarAbierto"
      etiqueta-entidad="ítem de plantilla"
      :nombre="registroAEliminar?.nombre_item ?? ''"
      :eliminando="eliminando"
      @confirmar="onConfirmarEliminar"
    />
  </div>
</template>

<script setup lang="ts">
import type { ItemPlantillaRow } from '~/composables/useChecklistPlantillas'

definePageMeta({ layout: 'admin' })

const { tienePermiso } = usePermisos()
const puedeEditar = computed(() => tienePermiso('checklist', 'editar'))

const tiposVehiculo = useCatalogo('tipos_vehiculo', {
  camposBusqueda: ['nombre'],
  ordenarPor: 'nombre',
  mensajeDependientes: ''
})
const plantilla = useChecklistPlantillas()

const tipoVehiculoId = ref<string>('')
const dialogoFormularioAbierto = ref(false)
const dialogoEliminarAbierto = ref(false)
const registroEditando = ref<ItemPlantillaRow | null>(null)
const registroAEliminar = ref<ItemPlantillaRow | null>(null)
const eliminando = ref(false)

onMounted(() => {
  tiposVehiculo.listar()
})

watch(tipoVehiculoId, async (id) => {
  if (id) await plantilla.listar(id)
})

function abrirAlta() {
  registroEditando.value = null
  dialogoFormularioAbierto.value = true
}

function abrirEdicion(item: ItemPlantillaRow) {
  registroEditando.value = item
  dialogoFormularioAbierto.value = true
}

async function onGuardado() {
  dialogoFormularioAbierto.value = false
  if (tipoVehiculoId.value) await plantilla.listar(tipoVehiculoId.value)
}

function abrirEliminar(item: ItemPlantillaRow) {
  registroAEliminar.value = item
  dialogoEliminarAbierto.value = true
}

async function onConfirmarEliminar() {
  if (!registroAEliminar.value) return
  eliminando.value = true
  try {
    await plantilla.eliminar(registroAEliminar.value.id)
    if (tipoVehiculoId.value) await plantilla.listar(tipoVehiculoId.value)
  } finally {
    dialogoEliminarAbierto.value = false
    eliminando.value = false
  }
}
</script>
