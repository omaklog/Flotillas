<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">
          {{ conductor ? `Editar ${conductor.nombre} ${conductor.apellidos}` : 'Editar conductor' }}
        </h1>
      </div>
      <v-btn
        variant="text"
        data-testid="cancelar-editar-btn"
        :to="`/admin/conductores/${conductorId}`"
      >
        Cancelar
      </v-btn>
    </div>

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-alert v-else-if="!conductor" type="error" data-testid="conductor-no-encontrado">
      No se encontró ese conductor en tu empresa.
    </v-alert>

    <ConductoresFormularioConductor
      v-else
      :registro="conductor"
      :enviando="enviando"
      :error-externo="errorMsg"
      @enviar="onEditar"
    />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type ConductorRow = Database['public']['Tables']['conductores']['Row']
type ConductorValores = Omit<
  Database['public']['Tables']['conductores']['Insert'],
  'empresa_id' | 'licencia_archivo_id'
>

const route = useRoute()
const conductorId = route.params.id as string

const client = useSupabaseClient<Database>()
const { editar, adjuntarLicencia, adjuntarFoto, error: errorConductores } = useConductores()

const cargando = ref(true)
const conductor = ref<ConductorRow | null>(null)
const enviando = ref(false)
const errorMsg = ref<string | null>(null)

onMounted(async () => {
  cargando.value = true
  const { data } = await client
    .from('conductores')
    .select('*')
    .eq('id', conductorId)
    .maybeSingle()
  conductor.value = data
  cargando.value = false
})

async function onEditar(
  valores: ConductorValores,
  archivoLicencia: File | null,
  archivoFoto: File | null
) {
  enviando.value = true
  errorMsg.value = null
  try {
    await editar(conductorId, valores)
  } catch {
    errorMsg.value = errorConductores.value ?? 'No se pudo guardar el conductor.'
    enviando.value = false
    return
  }

  // Si cualquiera de las dos subidas falla, la edición de datos ya quedó guardada — no se pierde
  // (mismo criterio que el alta, FR-005).
  if (archivoLicencia) {
    try {
      await adjuntarLicencia(conductorId, archivoLicencia)
    } catch {
      // Silencioso a propósito.
    }
  }
  if (archivoFoto) {
    try {
      await adjuntarFoto(conductorId, archivoFoto)
    } catch {
      // Silencioso a propósito.
    }
  }

  enviando.value = false
  await navigateTo(`/admin/conductores/${conductorId}`)
}
</script>
