<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">
          {{ servicio ? `Editar ${etiquetaTipo(servicio.tipo)}` : 'Editar servicio obligatorio' }}
        </h1>
      </div>
      <v-btn variant="text" data-testid="cancelar-editar-btn" :to="`/admin/servicios-obligatorios/${servicioId}`">
        Cancelar
      </v-btn>
    </div>

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-alert v-else-if="!servicio" type="error" data-testid="servicio-no-encontrado">
      No se encontró ese servicio obligatorio en tu empresa.
    </v-alert>

    <ServiciosObligatoriosFormularioServicioObligatorio
      v-else
      :registro="servicio"
      :enviando="enviando"
      :error-externo="errorMsg"
      @enviar="onEditar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ServicioRow } from '~/composables/useServiciosObligatorios'
import { etiquetaTipo } from '~/utils/servicios-obligatorios'

definePageMeta({ layout: 'admin' })

type ServicioValores = Omit<Database['public']['Tables']['servicios_obligatorios']['Insert'], 'empresa_id'>

const route = useRoute()
const servicioId = route.params.id as string

const client = useSupabaseClient<Database>()
const { editar, adjuntarComprobante, error: errorServicios } = useServiciosObligatorios()

const cargando = ref(true)
const servicio = ref<ServicioRow | null>(null)
const enviando = ref(false)
const errorMsg = ref<string | null>(null)

onMounted(async () => {
  cargando.value = true
  const { data } = await client.from('servicios_obligatorios').select('*').eq('id', servicioId).maybeSingle()
  servicio.value = data
  cargando.value = false
})

async function onEditar(valores: ServicioValores, archivoComprobante: File | null) {
  enviando.value = true
  errorMsg.value = null
  try {
    await editar(servicioId, valores)
  } catch {
    errorMsg.value = errorServicios.value ?? 'No se pudo guardar el servicio obligatorio.'
    enviando.value = false
    return
  }

  // Si la subida del comprobante falla, la edición de datos ya quedó guardada — no se pierde
  // (mismo criterio que el registro, FR-005).
  if (archivoComprobante) {
    try {
      await adjuntarComprobante(servicioId, archivoComprobante)
    } catch {
      // Silencioso a propósito.
    }
  }

  enviando.value = false
  await navigateTo(`/admin/servicios-obligatorios/${servicioId}`)
}
</script>
