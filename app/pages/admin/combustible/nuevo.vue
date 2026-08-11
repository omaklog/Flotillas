<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Nueva carga de combustible</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Registra una carga de combustible de un vehículo de tu flotilla.
        </p>
      </div>
    </div>

    <CombustibleFormularioCarga
      :enviando="enviando"
      :error-externo="errorMsg"
      @enviar="onEnviar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type CargaValores = Omit<
  Database['public']['Tables']['cargas_combustible']['Insert'],
  'empresa_id' | 'creado_por'
>

const { crear, adjuntarFactura, error: errorCargas } = useCargasCombustible()

const enviando = ref(false)
const errorMsg = ref<string | null>(null)

async function onEnviar(valores: CargaValores, archivoFactura: File | null) {
  enviando.value = true
  errorMsg.value = null
  let cargaId: string
  try {
    cargaId = await crear(valores)
  } catch {
    errorMsg.value = errorCargas.value ?? 'No se pudo crear la carga de combustible.'
    enviando.value = false
    return
  }

  // Si la subida de factura falla, la carga ya creada no se revierte (FR-015) — el admin puede
  // adjuntarla después desde el detalle.
  if (archivoFactura) {
    try {
      await adjuntarFactura(cargaId, archivoFactura)
    } catch {
      // Silencioso a propósito, mismo criterio que la póliza de Vehículos.
    }
  }

  enviando.value = false
  await navigateTo(`/admin/combustible/${cargaId}`)
}
</script>
