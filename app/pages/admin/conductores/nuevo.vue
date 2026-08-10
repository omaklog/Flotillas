<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Nuevo conductor</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Da de alta un conductor de tu flotilla.
        </p>
      </div>
    </div>

    <ConductoresFormularioConductor
      :enviando="enviando"
      :error-externo="errorMsg"
      @enviar="onEnviar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type ConductorValores = Omit<
  Database['public']['Tables']['conductores']['Insert'],
  'empresa_id' | 'licencia_archivo_id'
>

const { crear, adjuntarLicencia, error: errorConductores } = useConductores()

const enviando = ref(false)
const errorMsg = ref<string | null>(null)

async function onEnviar(valores: ConductorValores, archivoLicencia: File | null) {
  enviando.value = true
  errorMsg.value = null
  let conductorId: string
  try {
    conductorId = await crear(valores)
  } catch {
    errorMsg.value = errorConductores.value ?? 'No se pudo crear el conductor.'
    enviando.value = false
    return
  }

  // Si la subida falla, el conductor del paso 1 ya quedó creado — no se pierde el alta (FR-005).
  if (archivoLicencia) {
    try {
      await adjuntarLicencia(conductorId, archivoLicencia)
    } catch {
      // Silencioso a propósito: el admin puede adjuntar la licencia después editando el registro.
    }
  }

  enviando.value = false
  await navigateTo('/admin/conductores')
}
</script>
