<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">
          {{ conductor ? `${conductor.nombre} ${conductor.apellidos}` : 'Conductor' }}
        </h1>
        <div v-if="conductor" class="d-flex align-center ga-2 mt-1">
          <p class="text-metadata text-medium-emphasis">
            Licencia {{ conductor.numero_licencia }}
          </p>
          <v-chip v-if="!conductor.activo" color="grey" size="small" data-testid="estado-inactivo-chip">
            Inactivo
          </v-chip>
        </div>
      </div>
      <div v-if="conductor" class="d-flex ga-2">
        <v-btn
          variant="flat"
          color="primary"
          prepend-icon="mdi-pencil-outline"
          data-testid="editar-btn"
          :to="`/admin/conductores/${conductorId}/editar`"
        >
          Editar
        </v-btn>
        <v-btn
          v-if="conductor.activo"
          variant="outlined"
          color="error"
          data-testid="desactivar-btn"
          @click="dialogoDesactivarAbierto = true"
        >
          Desactivar
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

    <ConductoresDialogoDesactivar
      v-model="dialogoDesactivarAbierto"
      :enviando="desactivando"
      :error-externo="errorDesactivar"
      @confirmar="onDesactivar"
    />

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-alert v-else-if="!conductor" type="error" data-testid="conductor-no-encontrado">
      No se encontró ese conductor en tu empresa.
    </v-alert>

    <template v-else>
      <v-tabs v-model="tabActiva" class="mb-4">
        <v-tab value="datos">Datos</v-tab>
        <v-tab value="historial">Historial de Licencia</v-tab>
        <v-tab value="vehiculos">Vehículos Asignados</v-tab>
      </v-tabs>

      <v-window v-model="tabActiva">
        <!-- 2 tarjetas lado a lado siguiendo detalle-conductor-datos-generales.png
        (research.md R4 de specs/006-foto-conductor/): a diferencia de Vehículos (foto embebida
        dentro de la tarjeta de datos), esta referencia separa la foto en su propia tarjeta
        angosta con nombre y chip de tipo de licencia debajo. -->
        <v-window-item value="datos" data-testid="datos-conductor">
          <v-row>
            <v-col cols="12" md="4">
              <v-card class="app-card-shadow" variant="flat" data-testid="tarjeta-foto-conductor">
                <v-card-text class="d-flex flex-column align-center text-center">
                  <v-img
                    v-if="fotoUrl"
                    :src="fotoUrl"
                    alt="Foto del conductor"
                    width="200"
                    height="200"
                    cover
                    rounded
                    class="mb-4"
                    data-testid="foto-conductor"
                  />
                  <div
                    v-else
                    class="d-flex align-center justify-center bg-surface rounded mb-4"
                    style="width: 200px; height: 200px; border: 1px dashed rgb(var(--v-theme-outline))"
                    data-testid="foto-conductor-vacia"
                  >
                    <v-icon icon="mdi-account" size="64" color="grey" />
                  </div>
                  <p class="text-body-main font-weight-medium">
                    {{ conductor.nombre }} {{ conductor.apellidos }}
                  </p>
                  <v-chip class="mt-2" size="small">
                    Conductor {{ conductor.tipo_licencia === 'federal' ? 'Federal' : 'Local' }}
                  </v-chip>
                </v-card-text>
              </v-card>
            </v-col>

            <v-col cols="12" md="8">
              <v-card class="app-card-shadow" variant="flat" data-testid="tarjeta-datos-conductor">
                <v-card-text>
                  <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                    <v-icon icon="mdi-card-account-details-outline" color="primary" class="mr-2" />
                    Datos del conductor
                  </h2>
                  <v-row>
                    <v-col v-for="campo in campos" :key="campo.label" cols="12" sm="6">
                      <p class="text-label-caps text-medium-emphasis">{{ campo.label }}</p>
                      <p class="text-body-main mt-2">{{ campo.valor ?? '—' }}</p>
                    </v-col>
                    <v-col cols="12" sm="6">
                      <p class="text-label-caps text-medium-emphasis">Vencimiento de licencia</p>
                      <div class="d-flex align-center ga-2 mt-2">
                        <p class="text-body-main">{{ conductor.fecha_vencimiento_licencia }}</p>
                        <v-chip :color="estadoLicencia.color" size="small">
                          {{ estadoLicencia.texto }}
                        </v-chip>
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-window-item>

        <v-window-item value="historial">
          <ConductoresHistorialLicencia
            :key="conductor.licencia_archivo_id ?? 'sin-licencia'"
            :conductor-id="conductor.id"
            :licencia-vigente-id="conductor.licencia_archivo_id"
            @subida="cargar"
          />
        </v-window-item>

        <v-window-item value="vehiculos">
          <ConductoresVehiculosAsignados :conductor-id="conductor.id" />
        </v-window-item>
      </v-window>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ConductorRow } from '~/composables/useConductores'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const conductorId = route.params.id as string

const { desactivar, reactivar, descargarArchivo, error: errorConductores } = useConductores()
const client = useSupabaseClient()

const cargando = ref(true)
const conductor = ref<ConductorRow | null>(null)
const fotoUrl = ref<string | null>(null)
const tabActiva = ref('datos')

const dialogoDesactivarAbierto = ref(false)
const desactivando = ref(false)
const reactivando = ref(false)
const errorDesactivar = ref<string | null>(null)

const UMBRAL_POR_VENCER_DIAS = 60
const MS_POR_DIA = 24 * 60 * 60 * 1000

const campos = computed(() => {
  const c = conductor.value
  if (!c) return []
  return [
    { label: 'Nombre', valor: c.nombre },
    { label: 'Apellidos', valor: c.apellidos },
    { label: 'Celular', valor: c.celular },
    { label: 'Calle', valor: c.calle },
    { label: 'Número', valor: c.numero },
    { label: 'Colonia', valor: c.colonia },
    { label: 'Número de licencia', valor: c.numero_licencia },
    { label: 'Tipo de licencia', valor: c.tipo_licencia === 'federal' ? 'Federal' : 'Local' }
  ]
})

const estadoLicencia = computed<{ texto: string; color: 'success' | 'warning' | 'error' }>(() => {
  const fecha = conductor.value?.fecha_vencimiento_licencia
  if (!fecha) return { texto: '', color: 'success' }
  const diasRestantes = Math.floor((new Date(fecha).getTime() - Date.now()) / MS_POR_DIA)
  if (diasRestantes < 0) return { texto: 'Vencida', color: 'error' }
  if (diasRestantes <= UMBRAL_POR_VENCER_DIAS) return { texto: 'Por vencer', color: 'warning' }
  return { texto: 'Vigente', color: 'success' }
})

async function cargar() {
  const { data } = await client
    .from('conductores')
    .select('*')
    .eq('id', conductorId)
    .maybeSingle()
  conductor.value = data

  fotoUrl.value = null
  if (conductor.value?.foto_archivo_id) {
    const { data: foto } = await client
      .from('archivos')
      .select('storage_path')
      .eq('id', conductor.value.foto_archivo_id)
      .maybeSingle()
    if (foto) {
      fotoUrl.value = await descargarArchivo(foto.storage_path)
    }
  }
}

onMounted(async () => {
  cargando.value = true
  await cargar()
  cargando.value = false
})

async function onDesactivar(motivo: string) {
  desactivando.value = true
  errorDesactivar.value = null
  try {
    await desactivar(conductorId, motivo)
    dialogoDesactivarAbierto.value = false
    await cargar()
  } catch {
    errorDesactivar.value = errorConductores.value ?? 'No se pudo desactivar el conductor.'
  } finally {
    desactivando.value = false
  }
}

async function onReactivar() {
  reactivando.value = true
  try {
    await reactivar(conductorId)
    await cargar()
  } finally {
    reactivando.value = false
  }
}
</script>
