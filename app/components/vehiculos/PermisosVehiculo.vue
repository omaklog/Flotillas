<template>
  <div>
    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-file-certificate-outline" color="primary" class="mr-2" />
          Asignar permiso
        </h2>

        <v-row align="end">
          <v-col cols="12" md="6">
            <!-- v-autocomplete, no v-select: el catálogo de permisos crece sin límite por
            empresa, y un v-select virtualiza la lista completa (los ítems fuera del rango
            visible no existen en el DOM hasta que se hace scroll) — con filtro por texto el
            usuario nunca necesita desplazarse por decenas de opciones para encontrar una. -->
            <v-autocomplete
              v-model="permisoSeleccionado"
              label="Permiso"
              :items="catalogoPermisos.registros.value"
              item-title="nombre"
              item-value="id"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="fechaVencimientoNueva"
              label="Fecha de vencimiento del permiso"
              type="date"
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-btn
              color="primary"
              :loading="asignando"
              :disabled="!permisoSeleccionado"
              data-testid="asignar-permiso-btn"
              @click="onAsignar"
            >
              Asignar
            </v-btn>
          </v-col>
        </v-row>

        <v-alert v-if="errorAsignar" type="error" class="mt-2" data-testid="asignar-permiso-error">
          {{ errorAsignar }}
        </v-alert>
      </v-card-text>
    </v-card>

    <v-skeleton-loader v-if="cargando" type="list-item-two-line@2" />

    <v-list v-else data-testid="permisos-vehiculo-lista">
      <v-list-item
        v-for="asignacion in asignaciones"
        :key="asignacion.id"
        :data-testid="`permiso-item-${asignacion.id}`"
      >
        <v-list-item-title>{{ asignacion.permisos?.nombre }}</v-list-item-title>

        <template #append>
          <div class="d-flex align-center ga-2">
            <v-text-field
              v-model="vencimientosEditables[asignacion.id]"
              label="Vencimiento"
              type="date"
              hide-details
              density="compact"
              style="max-width: 180px"
              :data-testid="`fecha-vencimiento-input-${asignacion.id}`"
            />
            <v-btn
              icon="mdi-content-save-outline"
              size="small"
              variant="text"
              :aria-label="`Guardar vencimiento de ${asignacion.permisos?.nombre}`"
              :data-testid="`guardar-vencimiento-${asignacion.id}`"
              @click="onGuardarVencimiento(asignacion)"
            />
            <v-btn
              icon="mdi-close"
              size="small"
              variant="text"
              color="error"
              :aria-label="`Quitar ${asignacion.permisos?.nombre}`"
              :data-testid="`quitar-btn-${asignacion.id}`"
              @click="onQuitar(asignacion)"
            />
          </div>
        </template>
      </v-list-item>

      <v-list-item v-if="asignaciones.length === 0">
        <v-list-item-title class="text-medium-emphasis">
          Sin permisos asignados a este vehículo.
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup lang="ts">
type AsignacionPermiso = {
  id: string
  vehiculo_id: string
  permiso_id: string
  fecha_vencimiento: string | null
  permisos: { clave: string; nombre: string; tipo: string } | null
}

const props = defineProps<{ vehiculoId: string }>()

const catalogoPermisos = useCatalogo('permisos', {
  camposBusqueda: ['nombre'],
  ordenarPor: 'nombre',
  mensajeDependientes: ''
})
const { listarPermisos, asignarPermiso, editarVencimientoPermiso, quitarPermiso } = useVehiculos()

const cargando = ref(true)
const asignaciones = ref<AsignacionPermiso[]>([])
const vencimientosEditables = reactive<Record<string, string | null>>({})

const permisoSeleccionado = ref<string | null>(null)
const fechaVencimientoNueva = ref<string | null>(null)
const asignando = ref(false)
const errorAsignar = ref<string | null>(null)

async function cargar() {
  cargando.value = true
  await catalogoPermisos.listar()
  const data = await listarPermisos(props.vehiculoId)
  asignaciones.value = data as unknown as AsignacionPermiso[]
  for (const asignacion of asignaciones.value) {
    vencimientosEditables[asignacion.id] = asignacion.fecha_vencimiento
  }
  cargando.value = false
}

onMounted(cargar)

async function onAsignar() {
  if (!permisoSeleccionado.value) return
  asignando.value = true
  errorAsignar.value = null
  try {
    await asignarPermiso(props.vehiculoId, permisoSeleccionado.value, fechaVencimientoNueva.value)
    permisoSeleccionado.value = null
    fechaVencimientoNueva.value = null
    await cargar()
  } catch (err) {
    errorAsignar.value = err instanceof Error ? err.message : 'No se pudo asignar el permiso.'
  } finally {
    asignando.value = false
  }
}

async function onGuardarVencimiento(asignacion: AsignacionPermiso) {
  await editarVencimientoPermiso(asignacion.id, vencimientosEditables[asignacion.id] ?? null)
  await cargar()
}

async function onQuitar(asignacion: AsignacionPermiso) {
  await quitarPermiso(asignacion.id)
  await cargar()
}
</script>
