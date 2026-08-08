<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Aseguradoras</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Catálogo de compañías de seguro de tu empresa.
        </p>
      </div>
      <v-btn
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nuevo-btn"
        @click="abrirAlta"
      >
        Nueva aseguradora
      </v-btn>
    </div>

    <v-alert v-if="catalogo.error.value" type="error" class="mb-4" data-testid="catalogo-error">
      {{ catalogo.error.value }}
    </v-alert>

    <CatalogosTablaCatalogo
      :items="catalogo.registros.value"
      :cargando="catalogo.cargando.value"
      :busqueda="busqueda"
      etiqueta-busqueda="Buscar por nombre o RFC"
      mensaje-vacio="Sin aseguradoras que mostrar."
      :colspan-vacio="3"
      test-id-prefix="aseguradoras"
      @update:busqueda="onBuscar"
    >
      <template #encabezados>
        <th>Razón social</th>
        <th>RFC</th>
        <th></th>
      </template>
      <template #fila="{ item }">
        <td>{{ item.razon_social }}</td>
        <td>{{ item.rfc }}</td>
        <td>
          <div class="d-flex justify-end ga-1">
            <v-btn
              icon="mdi-pencil-outline"
              size="small"
              variant="text"
              density="comfortable"
              data-testid="editar-btn"
              :aria-label="`Editar ${item.razon_social}`"
              @click="abrirEdicion(item)"
            />
            <v-btn
              icon="mdi-delete-outline"
              size="small"
              variant="text"
              color="error"
              density="comfortable"
              data-testid="eliminar-btn"
              :aria-label="`Eliminar ${item.razon_social}`"
              @click="abrirEliminar(item)"
            />
          </div>
        </td>
      </template>
    </CatalogosTablaCatalogo>

    <v-dialog v-model="dialogoFormularioAbierto" max-width="480">
      <v-card class="app-modal-shadow" variant="flat">
        <v-card-title class="text-section-title">
          {{ registroEditando ? 'Editar aseguradora' : 'Nueva aseguradora' }}
        </v-card-title>
        <v-card-text>
          <CatalogosAseguradorasFormularioAseguradora
            :registro="registroEditando ?? undefined"
            @guardado="onGuardado"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <CatalogosDialogoConfirmarEliminarCatalogo
      v-model="dialogoEliminarAbierto"
      etiqueta-entidad="aseguradora"
      :nombre="registroAEliminar?.razon_social ?? ''"
      :eliminando="eliminando"
      @confirmar="onConfirmarEliminar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type Aseguradora = Database['public']['Tables']['aseguradoras']['Row']

const catalogo = useCatalogo('aseguradoras', {
  camposBusqueda: ['razon_social', 'rfc'],
  ordenarPor: 'razon_social',
  mensajeDependientes: 'No se puede eliminar: hay vehículos usando esta aseguradora.'
})

const busqueda = ref('')
const dialogoFormularioAbierto = ref(false)
const dialogoEliminarAbierto = ref(false)
const registroEditando = ref<Aseguradora | null>(null)
const registroAEliminar = ref<Aseguradora | null>(null)
const eliminando = ref(false)

onMounted(() => {
  catalogo.listar()
})

async function onBuscar(valor: string) {
  busqueda.value = valor
  await catalogo.listar(valor)
}

function abrirAlta() {
  registroEditando.value = null
  dialogoFormularioAbierto.value = true
}

function abrirEdicion(item: Aseguradora) {
  registroEditando.value = item
  dialogoFormularioAbierto.value = true
}

function onGuardado() {
  dialogoFormularioAbierto.value = false
  catalogo.listar(busqueda.value)
}

function abrirEliminar(item: Aseguradora) {
  registroAEliminar.value = item
  dialogoEliminarAbierto.value = true
}

async function onConfirmarEliminar() {
  if (!registroAEliminar.value) return
  eliminando.value = true
  try {
    await catalogo.eliminar(registroAEliminar.value.id)
    await catalogo.listar(busqueda.value)
  } catch {
    // catalogo.error ya tiene el mensaje mapeado (23503 → mensajeDependientes).
  } finally {
    dialogoEliminarAbierto.value = false
    eliminando.value = false
  }
}
</script>
