<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Nuevo vehículo</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Da de alta un vehículo de tu flotilla.
        </p>
      </div>
    </div>

    <VehiculosFormularioVehiculo
      :enviando="enviando"
      :error-externo="errorMsg"
      @enviar="onEnviar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type VehiculoValores = Omit<
  Database['public']['Tables']['vehiculos']['Insert'],
  'empresa_id' | 'poliza_archivo_id'
>

const { crear, adjuntarPoliza, adjuntarFoto, error: errorVehiculos } = useVehiculos()

const enviando = ref(false)
const errorMsg = ref<string | null>(null)

async function onEnviar(valores: VehiculoValores, archivoPoliza: File | null, archivoFoto: File | null) {
  enviando.value = true
  errorMsg.value = null
  let vehiculoId: string
  try {
    vehiculoId = await crear(valores)
  } catch {
    errorMsg.value = errorVehiculos.value ?? 'No se pudo crear el vehículo.'
    enviando.value = false
    return
  }

  // Si cualquiera de las dos subidas falla, el vehículo del paso 1 ya quedó creado — no se
  // pierde el alta (FR-005, mismo criterio para la foto).
  if (archivoPoliza) {
    try {
      await adjuntarPoliza(vehiculoId, archivoPoliza)
    } catch {
      // Silencioso a propósito: el admin puede adjuntar la póliza después editando el registro.
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
  await navigateTo('/admin/vehiculos')
}
</script>
