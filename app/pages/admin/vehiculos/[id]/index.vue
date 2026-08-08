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
          variant="flat"
          color="primary"
          prepend-icon="mdi-pencil-outline"
          data-testid="editar-btn"
          :to="`/admin/vehiculos/${vehiculoId}/editar`"
        >
          Editar
        </v-btn>
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
          <v-card class="app-card-shadow" variant="flat" data-testid="datos-vehiculo">
            <v-card-text>
              <div class="mb-4" style="max-width: 240px">
                <v-img
                  v-if="fotoUrl"
                  :src="fotoUrl"
                  alt="Foto del vehículo"
                  width="240"
                  height="180"
                  cover
                  rounded
                  data-testid="foto-vehiculo"
                />
                <div
                  v-else
                  class="d-flex align-center justify-center bg-surface rounded"
                  style="width: 240px; height: 180px; border: 1px dashed rgb(var(--v-theme-outline))"
                  data-testid="foto-vehiculo-vacia"
                >
                  <v-icon icon="mdi-car-outline" size="48" color="grey" />
                </div>
              </div>

              <v-row>
                <v-col v-for="campo in camposSoloLectura" :key="campo.label" cols="12" md="4">
                  <p class="text-label-caps text-medium-emphasis">{{ campo.label }}</p>
                  <p class="text-body-main">{{ campo.valor ?? '—' }}</p>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
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
import type { VehiculoListado } from '~/composables/useVehiculos'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const vehiculoId = route.params.id as string

const client = useSupabaseClient<Database>()
const { darDeBaja, reactivar, descargarArchivo, error: errorVehiculos } = useVehiculos()

const cargando = ref(true)
const vehiculo = ref<VehiculoListado | null>(null)
const fotoUrl = ref<string | null>(null)
const tabActiva = ref('datos')

const dialogoBajaAbierto = ref(false)
const dandoDeBaja = ref(false)
const reactivando = ref(false)
const errorBaja = ref<string | null>(null)

const camposSoloLectura = computed(() => {
  const v = vehiculo.value
  if (!v) return []
  return [
    { label: 'Marca', valor: v.marca },
    { label: 'Modelo', valor: v.modelo },
    { label: 'Placa', valor: v.placa },
    { label: 'Color', valor: v.color },
    { label: 'Año', valor: v.anio },
    { label: 'Número de serie', valor: v.numero_serie },
    { label: 'Número de motor', valor: v.numero_motor },
    { label: 'Capacidad de carga', valor: v.capacidad_carga },
    { label: 'Número de ejes', valor: v.numero_ejes },
    { label: 'Tipo de vehículo', valor: v.tipos_vehiculo?.nombre },
    { label: 'Aseguradora', valor: v.aseguradoras?.razon_social },
    { label: 'Número de póliza', valor: v.numero_poliza },
    { label: 'Fecha de vencimiento de póliza', valor: v.fecha_vencimiento_poliza }
  ]
})

async function cargar() {
  const { data } = await client
    .from('vehiculos')
    .select('*, tipos_vehiculo(nombre), aseguradoras(razon_social)')
    .eq('id', vehiculoId)
    .maybeSingle()
  vehiculo.value = data as unknown as VehiculoListado | null

  fotoUrl.value = null
  if (vehiculo.value?.foto_archivo_id) {
    const { data: foto } = await client
      .from('archivos')
      .select('storage_path')
      .eq('id', vehiculo.value.foto_archivo_id)
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
