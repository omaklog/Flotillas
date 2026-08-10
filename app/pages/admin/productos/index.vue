<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Productos</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Productos usados en combustible y mantenimiento de tu empresa.
        </p>
      </div>
      <v-btn
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nuevo-btn"
        @click="abrirAlta"
      >
        Nuevo producto
      </v-btn>
    </div>

    <v-alert v-if="productos.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ productos.error.value }}
    </v-alert>

    <v-autocomplete
      v-model="filtroTipo"
      label="Filtrar por tipo"
      :items="TIPOS_PRODUCTO"
      clearable
      density="compact"
      hide-details
      class="mb-4"
      style="max-width: 320px"
      data-testid="filtro-tipo"
      @update:model-value="onCambiarFiltroTipo"
    />

    <CatalogosTablaCatalogo
      :items="productos.registros.value"
      :cargando="productos.cargando.value"
      :busqueda="busqueda"
      etiqueta-busqueda="Buscar por nombre"
      mensaje-vacio="Sin productos que mostrar."
      :colspan-vacio="4"
      test-id-prefix="productos"
      @update:busqueda="onBuscar"
    >
      <template #encabezados>
        <th>Nombre</th>
        <th>Tipo</th>
        <th>Unidad</th>
        <th></th>
      </template>
      <template #fila="{ item }">
        <td>{{ item.nombre }}</td>
        <td>{{ etiquetaTipo(item.tipo) }}</td>
        <td>{{ item.unidad }}</td>
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
          {{ registroEditando ? 'Editar producto' : 'Nuevo producto' }}
        </v-card-title>
        <v-card-text>
          <ProductosFormularioProducto
            :registro="registroEditando ?? undefined"
            @guardado="onGuardado"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <CatalogosDialogoConfirmarEliminarCatalogo
      v-model="dialogoEliminarAbierto"
      etiqueta-entidad="producto"
      :nombre="registroAEliminar?.nombre ?? ''"
      :eliminando="eliminando"
      @confirmar="onConfirmarEliminar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ProductoRow } from '~/composables/useProductos'

definePageMeta({ layout: 'admin' })

type TipoProducto = Database['public']['Enums']['tipo_producto']

const TIPOS_PRODUCTO: { title: string; value: TipoProducto }[] = [
  { title: 'Refacción', value: 'refaccion' },
  { title: 'Combustible', value: 'combustible' },
  { title: 'Servicio', value: 'servicio' },
  { title: 'Llanta', value: 'llanta' },
  { title: 'Consumible', value: 'consumible' }
]

function etiquetaTipo(tipo: TipoProducto): string {
  return TIPOS_PRODUCTO.find((t) => t.value === tipo)?.title ?? tipo
}

const productos = useProductos()

const busqueda = ref('')
const filtroTipo = ref<TipoProducto | null>(null)
const dialogoFormularioAbierto = ref(false)
const dialogoEliminarAbierto = ref(false)
const registroEditando = ref<ProductoRow | null>(null)
const registroAEliminar = ref<ProductoRow | null>(null)
const eliminando = ref(false)

onMounted(() => {
  productos.listar()
})

async function onBuscar(valor: string) {
  busqueda.value = valor
  await productos.listar(valor, filtroTipo.value)
}

async function onCambiarFiltroTipo() {
  await productos.listar(busqueda.value, filtroTipo.value)
}

function abrirAlta() {
  registroEditando.value = null
  dialogoFormularioAbierto.value = true
}

function abrirEdicion(item: ProductoRow) {
  registroEditando.value = item
  dialogoFormularioAbierto.value = true
}

function onGuardado() {
  dialogoFormularioAbierto.value = false
  productos.listar(busqueda.value, filtroTipo.value)
}

function abrirEliminar(item: ProductoRow) {
  registroAEliminar.value = item
  dialogoEliminarAbierto.value = true
}

async function onConfirmarEliminar() {
  if (!registroAEliminar.value) return
  eliminando.value = true
  try {
    await productos.eliminar(registroAEliminar.value.id)
    await productos.listar(busqueda.value, filtroTipo.value)
  } catch {
    // productos.error ya tiene el mensaje mapeado (23503 → dependientes), visible en el v-alert.
  } finally {
    dialogoEliminarAbierto.value = false
    eliminando.value = false
  }
}
</script>
