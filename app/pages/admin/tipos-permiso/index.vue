<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Catálogo de Permisos</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Tipos de permiso (estatales y federales) que tu empresa tramita por vehículo.
        </p>
      </div>
      <v-btn
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nuevo-btn"
        @click="abrirAlta"
      >
        Nuevo permiso
      </v-btn>
    </div>

    <v-alert v-if="catalogo.error.value" type="error" class="mb-4" data-testid="catalogo-error">
      {{ catalogo.error.value }}
    </v-alert>

    <CatalogosTablaCatalogo
      :items="catalogo.registros.value"
      :cargando="catalogo.cargando.value"
      :busqueda="busqueda"
      etiqueta-busqueda="Buscar por nombre o clave"
      mensaje-vacio="Sin permisos que mostrar."
      :colspan-vacio="4"
      test-id-prefix="permisos"
      @update:busqueda="onBuscar"
    >
      <template #encabezados>
        <th>Clave</th>
        <th>Nombre</th>
        <th>Tipo</th>
        <th></th>
      </template>
      <template #fila="{ item }">
        <td>{{ item.clave }}</td>
        <td>{{ item.nombre }}</td>
        <td>{{ item.tipo === 'estatal' ? 'Estatal' : 'Federal' }}</td>
        <td>
          <div class="d-flex justify-end ga-1">
            <v-btn
              icon="mdi-pencil-outline"
              size="small"
              variant="text"
              density="comfortable"
              data-testid="editar-btn"
              :aria-label="`Editar ${item.nombre}`"
              @click="abrirEdicion(item)"
            />
            <v-btn
              icon="mdi-delete-outline"
              size="small"
              variant="text"
              color="error"
              density="comfortable"
              data-testid="eliminar-btn"
              :aria-label="`Eliminar ${item.nombre}`"
              @click="abrirEliminar(item)"
            />
          </div>
        </td>
      </template>
    </CatalogosTablaCatalogo>

    <v-dialog v-model="dialogoFormularioAbierto" max-width="480">
      <v-card class="app-modal-shadow" variant="flat">
        <v-card-title class="text-section-title">
          {{ registroEditando ? 'Editar permiso' : 'Nuevo permiso' }}
        </v-card-title>
        <v-card-text>
          <CatalogosPermisosFormularioTipoPermiso
            :registro="registroEditando ?? undefined"
            :claves-existentes="clavesExistentes"
            @guardado="onGuardado"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <CatalogosDialogoConfirmarEliminarCatalogo
      v-model="dialogoEliminarAbierto"
      etiqueta-entidad="permiso"
      :nombre="registroAEliminar?.nombre ?? ''"
      :eliminando="eliminando"
      @confirmar="onConfirmarEliminar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type TipoPermiso = Database['public']['Tables']['permisos']['Row']

const catalogo = useCatalogo('permisos', {
  camposBusqueda: ['nombre', 'clave'],
  ordenarPor: 'nombre',
  mensajeDependientes: 'No se puede eliminar: hay vehículos con este permiso asignado.'
})

const busqueda = ref('')
const dialogoFormularioAbierto = ref(false)
const dialogoEliminarAbierto = ref(false)
const registroEditando = ref<TipoPermiso | null>(null)
const registroAEliminar = ref<TipoPermiso | null>(null)
const eliminando = ref(false)

const clavesExistentes = computed(() =>
  catalogo.registros.value.filter((r) => r.id !== registroEditando.value?.id).map((r) => r.clave)
)

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

function abrirEdicion(item: TipoPermiso) {
  registroEditando.value = item
  dialogoFormularioAbierto.value = true
}

function onGuardado() {
  dialogoFormularioAbierto.value = false
  catalogo.listar(busqueda.value)
}

function abrirEliminar(item: TipoPermiso) {
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
