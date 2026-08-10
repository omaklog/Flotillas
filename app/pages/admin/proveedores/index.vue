<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Proveedores</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Proveedores de combustible y servicios de tu empresa.
        </p>
      </div>
      <v-btn
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="nuevo-btn"
        @click="abrirAlta"
      >
        Nuevo proveedor
      </v-btn>
    </div>

    <v-alert v-if="proveedores.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ proveedores.error.value }}
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
      :items="proveedores.registros.value"
      :cargando="proveedores.cargando.value"
      :busqueda="busqueda"
      etiqueta-busqueda="Buscar por nombre o RFC"
      mensaje-vacio="Sin proveedores que mostrar."
      :colspan-vacio="4"
      test-id-prefix="proveedores"
      @update:busqueda="onBuscar"
    >
      <template #encabezados>
        <th>Nombre</th>
        <th>RFC</th>
        <th>Estado</th>
        <th></th>
      </template>
      <template #fila="{ item }">
        <td>{{ item.nombre }}</td>
        <td>{{ item.rfc }}</td>
        <td>
          <v-chip v-if="!item.activo" color="grey" size="small" variant="tonal">Inactivo</v-chip>
        </td>
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
              v-if="item.activo"
              icon="mdi-account-off-outline"
              size="small"
              variant="text"
              color="error"
              density="comfortable"
              data-testid="desactivar-btn"
              :aria-label="`Desactivar ${item.nombre}`"
              @click="abrirDesactivar(item)"
            />
            <v-btn
              v-else
              icon="mdi-account-reactivate-outline"
              size="small"
              variant="text"
              density="comfortable"
              data-testid="reactivar-btn"
              :aria-label="`Reactivar ${item.nombre}`"
              :loading="reactivandoId === item.id"
              @click="onReactivar(item)"
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

    <v-dialog v-model="dialogoFormularioAbierto" max-width="560">
      <v-card class="app-modal-shadow" variant="flat">
        <v-card-title class="text-section-title">
          {{ registroEditando ? 'Editar proveedor' : 'Nuevo proveedor' }}
        </v-card-title>
        <v-card-text>
          <ProveedoresFormularioProveedor
            :registro="registroEditando ?? undefined"
            @guardado="onGuardado"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <ProveedoresDialogoDesactivar
      v-model="dialogoDesactivarAbierto"
      :enviando="desactivando"
      :error-externo="errorDesactivar"
      @confirmar="onDesactivar"
    />

    <CatalogosDialogoConfirmarEliminarCatalogo
      v-model="dialogoEliminarAbierto"
      etiqueta-entidad="proveedor"
      :nombre="registroAEliminar?.nombre ?? ''"
      :eliminando="eliminando"
      @confirmar="onConfirmarEliminar"
    />
  </div>
</template>

<script setup lang="ts">
import type { ProveedorRow } from '~/composables/useProveedores'

definePageMeta({ layout: 'admin' })

const proveedores = useProveedores()

const busqueda = ref('')
const mostrarInactivos = ref(false)
const dialogoFormularioAbierto = ref(false)
const dialogoEliminarAbierto = ref(false)
const dialogoDesactivarAbierto = ref(false)
const registroEditando = ref<ProveedorRow | null>(null)
const registroAEliminar = ref<ProveedorRow | null>(null)
const registroADesactivar = ref<ProveedorRow | null>(null)
const eliminando = ref(false)
const desactivando = ref(false)
const errorDesactivar = ref<string | null>(null)
const reactivandoId = ref<string | null>(null)

onMounted(() => {
  proveedores.listar()
})

async function onBuscar(valor: string) {
  busqueda.value = valor
  await proveedores.listar(valor, mostrarInactivos.value)
}

async function onCambiarFiltro() {
  await proveedores.listar(busqueda.value, mostrarInactivos.value)
}

function abrirAlta() {
  registroEditando.value = null
  dialogoFormularioAbierto.value = true
}

function abrirEdicion(item: ProveedorRow) {
  registroEditando.value = item
  dialogoFormularioAbierto.value = true
}

function onGuardado() {
  dialogoFormularioAbierto.value = false
  proveedores.listar(busqueda.value, mostrarInactivos.value)
}

function abrirDesactivar(item: ProveedorRow) {
  registroADesactivar.value = item
  errorDesactivar.value = null
  dialogoDesactivarAbierto.value = true
}

async function onDesactivar(motivo: string) {
  if (!registroADesactivar.value) return
  desactivando.value = true
  errorDesactivar.value = null
  try {
    await proveedores.desactivar(registroADesactivar.value.id, motivo)
    dialogoDesactivarAbierto.value = false
    await proveedores.listar(busqueda.value, mostrarInactivos.value)
  } catch {
    errorDesactivar.value = proveedores.error.value ?? 'No se pudo desactivar el proveedor.'
  } finally {
    desactivando.value = false
  }
}

async function onReactivar(item: ProveedorRow) {
  reactivandoId.value = item.id
  try {
    await proveedores.reactivar(item.id)
    await proveedores.listar(busqueda.value, mostrarInactivos.value)
  } finally {
    reactivandoId.value = null
  }
}

function abrirEliminar(item: ProveedorRow) {
  registroAEliminar.value = item
  dialogoEliminarAbierto.value = true
}

async function onConfirmarEliminar() {
  if (!registroAEliminar.value) return
  eliminando.value = true
  try {
    await proveedores.eliminar(registroAEliminar.value.id)
    await proveedores.listar(busqueda.value, mostrarInactivos.value)
  } catch {
    // proveedores.error ya tiene el mensaje mapeado (23503 → dependientes), visible en el
    // v-alert de arriba.
  } finally {
    dialogoEliminarAbierto.value = false
    eliminando.value = false
  }
}
</script>
