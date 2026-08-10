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
        <v-tab value="conductor">Conductor Asignado</v-tab>
        <v-tab value="permisos">Permisos</v-tab>
      </v-tabs>

      <v-window v-model="tabActiva">
        <v-window-item value="datos" data-testid="datos-vehiculo">
          <!-- Agrupado en tarjetas siguiendo detalle-vehiculo-datos-generales.png (FR-026,
          Clarifications sesión 2026-08-08), con un ajuste sobre esa referencia (feedback
          directo tras revisar el resultado en pantalla): "Registro y Seguimiento" se fusiona
          dentro de "Identificación del Vehículo" en vez de ser su propia tarjeta, y "Seguro y
          Póliza" toma su lugar en la columna derecha — 3 tarjetas en vez de 4, menos scroll y
          menos separación entre bloques relacionados del mismo vehículo. -->
          <v-row>
            <v-col cols="12" md="6">
              <v-card class="app-card-shadow" variant="flat" data-testid="tarjeta-identificacion">
                <v-card-text>
                  <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                    <v-icon icon="mdi-car-outline" color="primary" class="mr-2" />
                    Identificación del Vehículo
                  </h2>

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
                    <v-col
                      v-for="campo in [...camposIdentificacion, ...camposRegistro]"
                      :key="campo.label"
                      cols="6"
                    >
                      <p class="text-label-caps text-medium-emphasis">{{ campo.label }}</p>
                      <p class="text-body-main mt-2">{{ campo.valor ?? '—' }}</p>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>
            </v-col>

            <v-col cols="12" md="6">
              <v-card class="app-card-shadow mb-4" variant="flat" data-testid="tarjeta-seguro-poliza">
                <v-card-text>
                  <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                    <v-icon icon="mdi-shield-car" color="primary" class="mr-2" />
                    Seguro y Póliza
                  </h2>
                  <v-row>
                    <v-col cols="12" sm="6">
                      <p class="text-label-caps text-medium-emphasis">Aseguradora</p>
                      <p class="text-body-main mt-2">{{ vehiculo.aseguradoras?.razon_social ?? '—' }}</p>
                    </v-col>
                    <v-col cols="12" sm="6">
                      <p class="text-label-caps text-medium-emphasis">Número de póliza</p>
                      <p class="text-body-main mt-2">{{ vehiculo.numero_poliza ?? '—' }}</p>
                    </v-col>
                    <v-col cols="12">
                      <p class="text-label-caps text-medium-emphasis">Vencimiento</p>
                      <div class="d-flex align-center ga-2 mt-2">
                        <p class="text-body-main">{{ vehiculo.fecha_vencimiento_poliza ?? '—' }}</p>
                        <v-chip
                          v-if="vehiculo.fecha_vencimiento_poliza"
                          :color="estadoPoliza.color"
                          size="small"
                        >
                          {{ estadoPoliza.texto }}
                        </v-chip>
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <v-card class="app-card-shadow" variant="flat" data-testid="tarjeta-especificaciones">
                <v-card-text>
                  <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                    <v-icon icon="mdi-cog-outline" color="primary" class="mr-2" />
                    Especificaciones Técnicas
                  </h2>
                  <v-row>
                    <v-col v-for="campo in camposEspecificaciones" :key="campo.label" cols="12" sm="6">
                      <p class="text-label-caps text-medium-emphasis">{{ campo.label }}</p>
                      <p class="text-body-main mt-2">{{ campo.valor ?? '—' }}</p>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-window-item>

        <v-window-item value="historial">
          <VehiculosHistorialPoliza
            :key="vehiculo.poliza_archivo_id ?? 'sin-poliza'"
            :vehiculo-id="vehiculo.id"
            :poliza-vigente-id="vehiculo.poliza_archivo_id"
            @subida="cargar"
          />
        </v-window-item>

        <v-window-item value="conductor">
          <VehiculosConductorAsignado :vehiculo-id="vehiculo.id" />
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

const UMBRAL_POR_VENCER_DIAS = 60
const MS_POR_DIA = 24 * 60 * 60 * 1000

const camposIdentificacion = computed(() => {
  const v = vehiculo.value
  if (!v) return []
  return [
    { label: 'Marca', valor: v.marca },
    { label: 'Modelo', valor: v.modelo },
    { label: 'Año', valor: v.anio },
    { label: 'Color', valor: v.color },
    { label: 'Tipo de vehículo', valor: v.tipos_vehiculo?.nombre }
  ]
})

const camposRegistro = computed(() => {
  const v = vehiculo.value
  if (!v) return []
  return [
    { label: 'Placa', valor: v.placa },
    { label: 'VIN', valor: v.vin },
    { label: 'Número de serie', valor: v.numero_serie },
    { label: 'Número de motor', valor: v.numero_motor },
    { label: 'Kilometraje actual', valor: v.kilometraje_actual }
  ]
})

const camposEspecificaciones = computed(() => {
  const v = vehiculo.value
  if (!v) return []
  return [
    { label: 'Combustible', valor: v.combustible },
    { label: 'Transmisión', valor: v.transmision },
    { label: 'Número de ejes', valor: v.numero_ejes },
    { label: 'Capacidad de carga', valor: v.capacidad_carga }
  ]
})

const estadoPoliza = computed<{ texto: string; color: 'success' | 'warning' | 'error' }>(() => {
  const fecha = vehiculo.value?.fecha_vencimiento_poliza
  if (!fecha) return { texto: '', color: 'success' }
  const diasRestantes = Math.floor((new Date(fecha).getTime() - Date.now()) / MS_POR_DIA)
  if (diasRestantes < 0) return { texto: 'Vencida', color: 'error' }
  if (diasRestantes <= UMBRAL_POR_VENCER_DIAS) return { texto: 'Por vencer', color: 'warning' }
  return { texto: 'Vigente', color: 'success' }
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
