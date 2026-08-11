<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Nueva orden de mantenimiento</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Registra un mantenimiento correctivo o preventivo de un vehículo de tu flotilla.
        </p>
      </div>
    </div>

    <v-alert v-if="ordenCreadaId" type="warning" class="mb-4" data-testid="reintentar-lineas-alert">
      La orden se creó, pero sus líneas no se guardaron ({{ errorLineas }}).
      <div class="mt-2">
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          :loading="reintentando"
          data-testid="reintentar-lineas-btn"
          @click="onReintentarLineas"
        >
          Reintentar líneas
        </v-btn>
      </div>
    </v-alert>

    <MantenimientoFormularioOrden
      :enviando="enviando"
      :error-externo="errorMsg"
      @enviar="onEnviar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { LineaValores } from '~/composables/useMantenimientos'

definePageMeta({ layout: 'admin' })

type OrdenValores = Omit<
  Database['public']['Tables']['mantenimientos']['Insert'],
  'empresa_id' | 'creado_por'
>

const { crear, reintentarLineas, adjuntarFactura, error: errorMantenimientos } = useMantenimientos()

const enviando = ref(false)
const reintentando = ref(false)
const errorMsg = ref<string | null>(null)
const errorLineas = ref<string | null>(null)
const ordenCreadaId = ref<string | null>(null)
let lineasPendientes: LineaValores[] = []
let archivoPendiente: File | null = null

async function onEnviar(valores: OrdenValores, lineas: LineaValores[], archivo: File | null) {
  enviando.value = true
  errorMsg.value = null
  errorLineas.value = null

  const resultado = await (async () => {
    try {
      return await crear(valores, lineas)
    } catch {
      errorMsg.value = errorMantenimientos.value ?? 'No se pudo crear la orden de mantenimiento.'
      return null
    }
  })()

  if (!resultado) {
    enviando.value = false
    return
  }

  if (resultado.lineasFallaron) {
    ordenCreadaId.value = resultado.mantenimientoId
    errorLineas.value = errorMantenimientos.value ?? 'No se pudieron guardar las líneas.'
    lineasPendientes = lineas
    archivoPendiente = archivo
    enviando.value = false
    return
  }

  if (archivo) {
    try {
      await adjuntarFactura(resultado.mantenimientoId, archivo)
    } catch {
      // Silencioso a propósito, mismo criterio que Combustible.
    }
  }

  enviando.value = false
  await navigateTo(`/admin/mantenimiento/${resultado.mantenimientoId}`)
}

async function onReintentarLineas() {
  if (!ordenCreadaId.value) return
  reintentando.value = true
  try {
    await reintentarLineas(ordenCreadaId.value, lineasPendientes)
    if (archivoPendiente) {
      try {
        await adjuntarFactura(ordenCreadaId.value, archivoPendiente)
      } catch {
        // Silencioso a propósito.
      }
    }
    await navigateTo(`/admin/mantenimiento/${ordenCreadaId.value}`)
  } catch {
    errorLineas.value = errorMantenimientos.value ?? 'No se pudieron guardar las líneas.'
  } finally {
    reintentando.value = false
  }
}
</script>
