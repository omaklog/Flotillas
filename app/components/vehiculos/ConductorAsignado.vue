<template>
  <div data-testid="conductor-asignado-card">
    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-account-tie-outline" color="primary" class="mr-2" />
          Conductor Asignado
        </h2>

        <v-skeleton-loader v-if="cargando" type="list-item-two-line" />

        <template v-else>
          <div v-if="activa" class="d-flex align-center justify-space-between flex-wrap ga-2 mb-4">
            <p class="text-body-main" data-testid="conductor-vigente-nombre">
              {{ activa.conductores?.nombre }} {{ activa.conductores?.apellidos }}
            </p>
            <div class="d-flex ga-2">
              <v-btn
                variant="outlined"
                data-testid="asignar-conductor-btn"
                @click="mostrarSelector = !mostrarSelector"
              >
                Cambiar conductor
              </v-btn>
              <v-btn
                variant="outlined"
                color="error"
                :loading="finalizando"
                data-testid="finalizar-asignacion-btn"
                @click="onFinalizar"
              >
                Finalizar asignación
              </v-btn>
            </div>
          </div>
          <div v-else class="d-flex align-center justify-space-between flex-wrap ga-2 mb-4">
            <p class="text-body-main text-medium-emphasis">Sin conductor asignado.</p>
            <v-btn
              color="primary"
              variant="flat"
              data-testid="asignar-conductor-btn"
              @click="mostrarSelector = !mostrarSelector"
            >
              Asignar conductor
            </v-btn>
          </div>

          <v-row v-if="mostrarSelector" align="end">
            <v-col cols="12" md="8">
              <!-- v-autocomplete: mismo criterio que PermisosVehiculo.vue — el catálogo de
              conductores crece sin límite por empresa. -->
              <v-autocomplete
                v-model="conductorSeleccionado"
                label="Conductor"
                :items="opcionesConductor"
                item-title="nombreCompleto"
                item-value="id"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-btn
                color="primary"
                :loading="asignando"
                :disabled="!conductorSeleccionado"
                data-testid="confirmar-asignar-conductor-btn"
                @click="onIntentarAsignar"
              >
                Confirmar
              </v-btn>
            </v-col>
          </v-row>

          <v-alert v-if="errorAsignar" type="error" class="mt-2" data-testid="asignar-conductor-error">
            {{ errorAsignar }}
          </v-alert>
        </template>
      </v-card-text>
    </v-card>

    <v-dialog v-model="dialogoAdvertenciaAbierto" max-width="480">
      <v-card class="app-modal-shadow" variant="flat">
        <v-card-title>Este conductor ya tiene vehículos asignados</v-card-title>
        <v-card-text>
          <p class="text-body-main mb-2" data-testid="advertencia-conductor-ocupado">
            {{ nombreConductorSeleccionado }} ya está asignado a:
            {{ vehiculosDelConductorSeleccionado.join(', ') }}. Puede seguir asignado a varios
            vehículos a la vez.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" data-testid="advertencia-cancelar-btn" @click="dialogoAdvertenciaAbierto = false">
            Cancelar
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="asignando"
            data-testid="advertencia-continuar-btn"
            @click="onConfirmarAsignacion"
          >
            Continuar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-card class="app-card-shadow" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-history" color="primary" class="mr-2" />
          Historial de Asignaciones
        </h2>

        <v-skeleton-loader v-if="cargando" type="table" />

        <v-table v-else data-testid="historial-asignaciones-vehiculo-tabla">
          <thead>
            <tr>
              <th class="text-label-caps text-medium-emphasis">Conductor</th>
              <th class="text-label-caps text-medium-emphasis">Fecha inicio</th>
              <th class="text-label-caps text-medium-emphasis">Fecha fin</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="fila in historial"
              :key="fila.id"
              :data-testid="`historial-asignacion-item-${fila.id}`"
            >
              <td>{{ fila.conductores?.nombre }} {{ fila.conductores?.apellidos }}</td>
              <td>{{ fila.fecha_inicio }}</td>
              <td>
                <v-chip v-if="!fila.fecha_fin" color="success" size="small">Activo</v-chip>
                <span v-else>{{ fila.fecha_fin }}</span>
              </td>
            </tr>
            <tr v-if="historial.length === 0">
              <td colspan="3" class="text-center text-medium-emphasis">
                Sin asignaciones registradas.
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import type { AsignacionConConductor } from '~/composables/useAsignaciones'

const props = defineProps<{ vehiculoId: string }>()
const emit = defineEmits<{ asignada: [] }>()

const {
  listarHistorialVehiculo,
  listarVehiculosActivosDeConductor,
  asignar,
  finalizar,
  error: errorAsignaciones
} = useAsignaciones()
const conductores = useConductores()

const cargando = ref(true)
const historial = ref<AsignacionConConductor[]>([])
const mostrarSelector = ref(false)
const conductorSeleccionado = ref<string | null>(null)
const asignando = ref(false)
const finalizando = ref(false)
const errorAsignar = ref<string | null>(null)

const dialogoAdvertenciaAbierto = ref(false)
const nombreConductorSeleccionado = ref('')
const vehiculosDelConductorSeleccionado = ref<string[]>([])

const activa = computed(() => historial.value.find((fila) => !fila.fecha_fin) ?? null)

const opcionesConductor = computed(() =>
  conductores.registros.value
    .filter((c) => c.id !== activa.value?.conductor_id)
    .map((c) => ({ id: c.id, nombreCompleto: `${c.nombre} ${c.apellidos}` }))
)

async function cargar() {
  historial.value = await listarHistorialVehiculo(props.vehiculoId)
  await conductores.listar()
}

onMounted(async () => {
  cargando.value = true
  await cargar()
  cargando.value = false
})

async function onIntentarAsignar() {
  if (!conductorSeleccionado.value) return
  errorAsignar.value = null

  const activasDelConductor = await listarVehiculosActivosDeConductor(conductorSeleccionado.value)
  if (activasDelConductor.length > 0) {
    const opcion = conductores.registros.value.find((c) => c.id === conductorSeleccionado.value)
    nombreConductorSeleccionado.value = opcion ? `${opcion.nombre} ${opcion.apellidos}` : 'Este conductor'
    vehiculosDelConductorSeleccionado.value = activasDelConductor.map(
      (fila) => `${fila.vehiculos?.marca} ${fila.vehiculos?.modelo}`
    )
    dialogoAdvertenciaAbierto.value = true
    return
  }

  await onConfirmarAsignacion()
}

async function onConfirmarAsignacion() {
  if (!conductorSeleccionado.value) return
  asignando.value = true
  errorAsignar.value = null
  try {
    await asignar(props.vehiculoId, conductorSeleccionado.value)
    dialogoAdvertenciaAbierto.value = false
    mostrarSelector.value = false
    conductorSeleccionado.value = null
    await cargar()
    emit('asignada')
  } catch {
    errorAsignar.value = errorAsignaciones.value ?? 'No se pudo asignar el conductor.'
  } finally {
    asignando.value = false
  }
}

async function onFinalizar() {
  if (!activa.value) return
  finalizando.value = true
  errorAsignar.value = null
  try {
    await finalizar(activa.value.id)
    await cargar()
    emit('asignada')
  } catch {
    errorAsignar.value = errorAsignaciones.value ?? 'No se pudo finalizar la asignación.'
  } finally {
    finalizando.value = false
  }
}
</script>
