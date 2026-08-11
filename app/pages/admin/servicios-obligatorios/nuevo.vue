<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Nuevo servicio obligatorio</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Registra el cumplimiento de un servicio obligatorio de un vehículo de tu flotilla.
        </p>
      </div>
    </div>

    <ServiciosObligatoriosFormularioServicioObligatorio
      :enviando="enviando"
      :error-externo="errorMsg"
      @enviar="onEnviar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type ServicioValores = Omit<Database['public']['Tables']['servicios_obligatorios']['Insert'], 'empresa_id'>

const { crear, adjuntarComprobante, error: errorServicios } = useServiciosObligatorios()

const enviando = ref(false)
const errorMsg = ref<string | null>(null)

async function onEnviar(valores: ServicioValores, archivoComprobante: File | null) {
  enviando.value = true
  errorMsg.value = null
  let servicioId: string
  try {
    servicioId = await crear(valores)
  } catch {
    errorMsg.value = errorServicios.value ?? 'No se pudo registrar el servicio obligatorio.'
    enviando.value = false
    return
  }

  // Si la subida del comprobante falla, el registro ya creado no se revierte — se puede adjuntar
  // después desde el detalle (FR-005, mismo criterio que la factura de Combustible).
  if (archivoComprobante) {
    try {
      await adjuntarComprobante(servicioId, archivoComprobante)
    } catch {
      // Silencioso a propósito, mismo criterio que Combustible/Vehículos.
    }
  }

  enviando.value = false
  await navigateTo(`/admin/servicios-obligatorios/${servicioId}`)
}
</script>
