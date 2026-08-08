<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">
          {{ vehiculo ? `Editar ${vehiculo.marca} ${vehiculo.modelo}` : 'Editar vehículo' }}
        </h1>
      </div>
      <v-btn variant="text" data-testid="cancelar-editar-btn" :to="`/admin/vehiculos/${vehiculoId}`">
        Cancelar
      </v-btn>
    </div>

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-alert v-else-if="!vehiculo" type="error" data-testid="vehiculo-no-encontrado">
      No se encontró ese vehículo en tu empresa.
    </v-alert>

    <VehiculosFormularioVehiculo
      v-else
      :registro="vehiculo"
      :enviando="enviando"
      :error-externo="errorMsg"
      @enviar="onEditar"
    />
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
const { editar, adjuntarPoliza, adjuntarFoto, error: errorVehiculos } = useVehiculos()

const cargando = ref(true)
const vehiculo = ref<VehiculoRow | null>(null)
const enviando = ref(false)
const errorMsg = ref<string | null>(null)

onMounted(async () => {
  cargando.value = true
  const { data } = await client.from('vehiculos').select('*').eq('id', vehiculoId).maybeSingle()
  vehiculo.value = data
  cargando.value = false
})

async function onEditar(valores: VehiculoValores, archivoPoliza: File | null, archivoFoto: File | null) {
  enviando.value = true
  errorMsg.value = null
  try {
    await editar(vehiculoId, valores)
  } catch {
    errorMsg.value = errorVehiculos.value ?? 'No se pudo guardar el vehículo.'
    enviando.value = false
    return
  }

  // Si cualquiera de las dos subidas falla, la edición de datos ya quedó guardada — no se pierde
  // (mismo criterio que el alta, FR-005).
  if (archivoPoliza) {
    try {
      await adjuntarPoliza(vehiculoId, archivoPoliza)
    } catch {
      // Silencioso a propósito.
    }
  }
  if (archivoFoto) {
    try {
      await adjuntarFoto(vehiculoId, archivoFoto)
    } catch {
      // Silencioso a propósito.
    }
  }

  enviando.value = false
  await navigateTo(`/admin/vehiculos/${vehiculoId}`)
}
</script>
