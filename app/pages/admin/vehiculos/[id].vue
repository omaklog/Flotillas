<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">{{ vehiculo ? `${vehiculo.marca} ${vehiculo.modelo}` : 'Vehículo' }}</h1>
        <div v-if="vehiculo" class="d-flex align-center ga-2 mt-1">
          <p class="text-metadata text-medium-emphasis">Placa {{ vehiculo.placa }}</p>
          <v-chip v-if="vehiculo.baja" color="grey" size="small" data-testid="estado-baja-chip">
            Dado de baja
          </v-chip>
        </div>
      </div>
      <div v-if="vehiculo" class="d-flex ga-2">
        <v-btn
          v-if="!vehiculo.baja"
          variant="outlined"
          color="error"
          data-testid="dar-de-baja-btn"
          @click="dialogoBajaAbierto = true"
        >
          Dar de baja
        </v-btn>
        <v-btn
          v-else
          variant="outlined"
          :loading="reactivando"
          data-testid="reactivar-btn"
          @click="onReactivar"
        >
          Reactivar
        </v-btn>
      </div>
    </div>

    <VehiculosDialogoDarDeBaja
      v-model="dialogoBajaAbierto"
      :enviando="dandoDeBaja"
      :error-externo="errorBaja"
      @confirmar="onDarDeBaja"
    />

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-alert v-else-if="!vehiculo" type="error" data-testid="vehiculo-no-encontrado">
      No se encontró ese vehículo en tu empresa.
    </v-alert>

    <template v-else>
      <v-tabs v-model="tabActiva" class="mb-4">
        <v-tab value="datos">Datos</v-tab>
        <v-tab value="historial">Historial de Póliza</v-tab>
        <v-tab value="permisos">Permisos</v-tab>
      </v-tabs>

      <v-window v-model="tabActiva">
        <v-window-item value="datos">
          <VehiculosFormularioVehiculo
            :registro="vehiculo"
            :enviando="enviando"
            :error-externo="errorMsg"
            @enviar="onEditar"
          />
        </v-window-item>

        <v-window-item value="historial">
          <VehiculosHistorialPoliza
            :key="vehiculo.poliza_archivo_id ?? 'sin-poliza'"
            :vehiculo-id="vehiculo.id"
            :poliza-vigente-id="vehiculo.poliza_archivo_id"
          />
        </v-window-item>

        <v-window-item value="permisos">
          <VehiculosPermisosVehiculo :vehiculo-id="vehiculo.id" />
        </v-window-item>
      </v-window>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type VehiculoRow = Database['public']['Tables']['vehiculos']['Row']
type VehiculoValores = Omit<
  Database['public']['Tables']['vehiculos']['Insert'],
  'empresa_id' | 'poliza_archivo_id'
>

const route = useRoute()
const vehiculoId = route.params.id as string

const client = useSupabaseClient<Database>()
const { editar, adjuntarPoliza, darDeBaja, reactivar, error: errorVehiculos } = useVehiculos()

const cargando = ref(true)
const vehiculo = ref<VehiculoRow | null>(null)
const tabActiva = ref('datos')
const enviando = ref(false)
const errorMsg = ref<string | null>(null)

const dialogoBajaAbierto = ref(false)
const dandoDeBaja = ref(false)
const reactivando = ref(false)
const errorBaja = ref<string | null>(null)

async function cargar() {
  const { data } = await client.from('vehiculos').select('*').eq('id', vehiculoId).maybeSingle()
  vehiculo.value = data
}

onMounted(async () => {
  cargando.value = true
  await cargar()
  cargando.value = false
})

async function onEditar(valores: VehiculoValores, archivo: File | null) {
  enviando.value = true
  errorMsg.value = null
  try {
    await editar(vehiculoId, valores)
  } catch {
    errorMsg.value = errorVehiculos.value ?? 'No se pudo guardar el vehículo.'
    enviando.value = false
    return
  }

  if (archivo) {
    // Si la subida falla, la edición de datos ya quedó guardada — no se pierde (mismo criterio
    // que el alta, FR-005).
    try {
      await adjuntarPoliza(vehiculoId, archivo)
    } catch {
      // Silencioso a propósito.
    }
  }

  await cargar()
  enviando.value = false
}

async function onDarDeBaja(motivo: string) {
  dandoDeBaja.value = true
  errorBaja.value = null
  try {
    await darDeBaja(vehiculoId, motivo)
    dialogoBajaAbierto.value = false
    await cargar()
  } catch {
    errorBaja.value = errorVehiculos.value ?? 'No se pudo dar de baja el vehículo.'
  } finally {
    dandoDeBaja.value = false
  }
}

async function onReactivar() {
  reactivando.value = true
  try {
    await reactivar(vehiculoId)
    await cargar()
  } finally {
    reactivando.value = false
  }
}
</script>
