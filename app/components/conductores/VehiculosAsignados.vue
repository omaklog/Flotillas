<template>
  <div data-testid="vehiculos-asignados-card">
    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-truck-outline" color="primary" class="mr-2" />
          Vehículos Asignados
        </h2>

        <v-skeleton-loader v-if="cargando" type="list-item-two-line" />

        <template v-else>
          <v-list v-if="activas.length > 0" class="mb-2">
            <v-list-item
              v-for="fila in activas"
              :key="fila.id"
              :data-testid="`vehiculo-activo-item-${fila.id}`"
            >
              <v-list-item-title>
                {{ fila.vehiculos?.marca }} {{ fila.vehiculos?.modelo }} ({{ fila.vehiculos?.placa }})
              </v-list-item-title>

              <template #append>
                <v-btn
                  variant="text"
                  size="small"
                  color="error"
                  :loading="finalizandoId === fila.id"
                  :data-testid="`finalizar-asignacion-btn-${fila.id}`"
                  @click="onFinalizar(fila.id)"
                >
                  Finalizar asignación
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
          <p v-else class="text-body-main text-medium-emphasis mb-4">
            Sin vehículos asignados actualmente.
          </p>

          <v-btn
            variant="outlined"
            data-testid="asignar-vehiculo-btn"
            @click="mostrarSelector = !mostrarSelector"
          >
            Asignar a otro vehículo
          </v-btn>

          <v-row v-if="mostrarSelector" align="end" class="mt-2">
            <v-col cols="12" md="8">
              <!-- v-autocomplete: mismo criterio que ConductorAsignado.vue/PermisosVehiculo.vue —
              el catálogo de vehículos crece sin límite por empresa. -->
              <v-autocomplete
                v-model="vehiculoSeleccionado"
                label="Vehículo"
                :items="opcionesVehiculo"
                item-title="nombreCompleto"
                item-value="id"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-btn
                color="primary"
                :loading="asignando"
                :disabled="!vehiculoSeleccionado"
                data-testid="confirmar-asignar-vehiculo-btn"
                @click="onIntentarAsignar"
              >
                Confirmar
              </v-btn>
            </v-col>
          </v-row>

          <v-alert v-if="errorAsignar" type="error" class="mt-2" data-testid="asignar-vehiculo-error">
            {{ errorAsignar }}
          </v-alert>
        </template>
      </v-card-text>
    </v-card>

    <v-dialog v-model="dialogoConfirmacionAbierto" max-width="480" data-testid="dialogo-confirmacion-fuerte">
      <v-card class="app-modal-shadow" variant="flat">
        <v-card-title>Reemplazar al conductor actual</v-card-title>
        <v-card-text>
          <p class="text-body-main mb-2" data-testid="confirmacion-fuerte-mensaje">
            El vehículo {{ vehiculoConflicto }} ya tiene asignado a {{ conductorConflicto }}.
            ¿Deseas reemplazarlo por este conductor?
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            data-testid="confirmacion-fuerte-cancelar-btn"
            @click="dialogoConfirmacionAbierto = false"
          >
            Cancelar
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="asignando"
            data-testid="confirmacion-fuerte-confirmar-btn"
            @click="onConfirmarAsignacion"
          >
            Reemplazar
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

        <v-table v-else data-testid="historial-asignaciones-conductor-tabla">
          <thead>
            <tr>
              <th class="text-label-caps text-medium-emphasis">Vehículo</th>
              <th class="text-label-caps text-medium-emphasis">Fecha inicio</th>
              <th class="text-label-caps text-medium-emphasis">Fecha fin</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="fila in historial"
              :key="fila.id"
              :data-testid="`historial-asignacion-conductor-item-${fila.id}`"
            >
              <td>{{ fila.vehiculos?.marca }} {{ fila.vehiculos?.modelo }}</td>
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
import type { AsignacionConVehiculo } from '~/composables/useAsignaciones'

const props = defineProps<{ conductorId: string }>()
const emit = defineEmits<{ asignada: [] }>()

const {
  listarHistorialConductor,
  obtenerAsignacionActivaDeVehiculo,
  asignar,
  finalizar,
  error: errorAsignaciones
} = useAsignaciones()
const vehiculos = useVehiculos()

const cargando = ref(true)
const historial = ref<AsignacionConVehiculo[]>([])
const mostrarSelector = ref(false)
const vehiculoSeleccionado = ref<string | null>(null)
const asignando = ref(false)
const finalizandoId = ref<string | null>(null)
const errorAsignar = ref<string | null>(null)

const dialogoConfirmacionAbierto = ref(false)
const vehiculoConflicto = ref('')
const conductorConflicto = ref('')

const activas = computed(() => historial.value.filter((fila) => !fila.fecha_fin))
const idsActivos = computed(() => new Set(activas.value.map((fila) => fila.vehiculo_id)))

const opcionesVehiculo = computed(() =>
  vehiculos.registros.value
    .filter((v) => !idsActivos.value.has(v.id))
    .map((v) => ({ id: v.id, nombreCompleto: `${v.marca} ${v.modelo} (${v.placa})` }))
)

async function cargar() {
  historial.value = await listarHistorialConductor(props.conductorId)
  await vehiculos.listar()
}

onMounted(async () => {
  cargando.value = true
  await cargar()
  cargando.value = false
})

async function onIntentarAsignar() {
  if (!vehiculoSeleccionado.value) return
  errorAsignar.value = null

  const activaDelVehiculo = await obtenerAsignacionActivaDeVehiculo(vehiculoSeleccionado.value)
  if (activaDelVehiculo && activaDelVehiculo.conductor_id !== props.conductorId) {
    const opcion = vehiculos.registros.value.find((v) => v.id === vehiculoSeleccionado.value)
    vehiculoConflicto.value = opcion ? `${opcion.marca} ${opcion.modelo}` : 'Este vehículo'
    conductorConflicto.value = activaDelVehiculo.conductores
      ? `${activaDelVehiculo.conductores.nombre} ${activaDelVehiculo.conductores.apellidos}`
      : 'otro conductor'
    dialogoConfirmacionAbierto.value = true
    return
  }

  await onConfirmarAsignacion()
}

async function onConfirmarAsignacion() {
  if (!vehiculoSeleccionado.value) return
  asignando.value = true
  errorAsignar.value = null
  try {
    await asignar(vehiculoSeleccionado.value, props.conductorId)
    dialogoConfirmacionAbierto.value = false
    mostrarSelector.value = false
    vehiculoSeleccionado.value = null
    await cargar()
    emit('asignada')
  } catch {
    errorAsignar.value = errorAsignaciones.value ?? 'No se pudo asignar el vehículo.'
  } finally {
    asignando.value = false
  }
}

async function onFinalizar(asignacionId: string) {
  finalizandoId.value = asignacionId
  errorAsignar.value = null
  try {
    await finalizar(asignacionId)
    await cargar()
    emit('asignada')
  } catch {
    errorAsignar.value = errorAsignaciones.value ?? 'No se pudo finalizar la asignación.'
  } finally {
    finalizandoId.value = null
  }
}
</script>
