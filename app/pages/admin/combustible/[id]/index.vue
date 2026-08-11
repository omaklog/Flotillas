<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">
          {{ carga ? `Carga de combustible — ${formatearFecha(carga.fecha)}` : 'Carga de combustible' }}
        </h1>
        <div v-if="carga" class="d-flex align-center ga-2 mt-1">
          <p class="text-metadata text-medium-emphasis">
            {{ carga.vehiculos?.marca }} {{ carga.vehiculos?.modelo }} — {{ carga.vehiculos?.placa }}
          </p>
          <v-chip
            :color="carga.estado === 'cancelado' ? 'grey' : 'success'"
            size="small"
            data-testid="estado-chip"
          >
            {{ carga.estado === 'cancelado' ? 'Cancelada' : 'Activa' }}
          </v-chip>
        </div>
      </div>
      <v-btn
        v-if="carga && carga.estado === 'activo' && tienePermiso('combustible', 'cancelar')"
        variant="outlined"
        color="error"
        data-testid="cancelar-btn"
        @click="dialogoCancelarAbierto = true"
      >
        Cancelar
      </v-btn>
    </div>

    <CombustibleDialogoCancelar
      v-model="dialogoCancelarAbierto"
      :enviando="cancelando"
      :error-externo="errorCancelar"
      @confirmar="onCancelar"
    />

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-alert v-else-if="!carga" type="error" data-testid="carga-no-encontrada">
      No se encontró esa carga de combustible en tu empresa.
    </v-alert>

    <template v-else>
      <v-row>
        <v-col cols="12" md="6">
          <v-card class="app-card-shadow mb-4" variant="flat" data-testid="tarjeta-datos">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-gas-station-outline" color="primary" class="mr-2" />
                Datos de la carga
              </h2>
              <v-row>
                <v-col v-for="campo in campos" :key="campo.label" cols="6">
                  <p class="text-label-caps text-medium-emphasis">{{ campo.label }}</p>
                  <p class="text-body-main mt-2">{{ campo.valor ?? '—' }}</p>
                </v-col>
              </v-row>
              <template v-if="carga.estado === 'cancelado'">
                <v-divider class="my-4" />
                <p class="text-label-caps text-medium-emphasis">Motivo de cancelación</p>
                <p class="text-body-main mt-2" data-testid="motivo-cancelacion">
                  {{ carga.motivo_cancelacion }}
                </p>
              </template>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <CombustibleHistorialFactura
            :key="carga.factura_archivo_id ?? 'sin-factura'"
            :carga-id="carga.id"
            :factura-vigente-id="carga.factura_archivo_id"
            :activo="carga.estado === 'activo'"
            @subida="cargar"
          />
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { CargaListado } from '~/composables/useCargasCombustible'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const cargaId = route.params.id as string

const client = useSupabaseClient<Database>()
const { tienePermiso } = usePermisos()
const { cancelar, error: errorCargas } = useCargasCombustible()

const cargando = ref(true)
const carga = ref<CargaListado | null>(null)

const dialogoCancelarAbierto = ref(false)
const cancelando = ref(false)
const errorCancelar = ref<string | null>(null)

async function onCancelar(motivo: string) {
  cancelando.value = true
  errorCancelar.value = null
  try {
    await cancelar(cargaId, motivo)
    dialogoCancelarAbierto.value = false
    await cargar()
  } catch {
    errorCancelar.value = errorCargas.value ?? 'No se pudo cancelar la carga de combustible.'
  } finally {
    cancelando.value = false
  }
}

const campos = computed(() => {
  const c = carga.value
  if (!c) return []
  return [
    { label: 'Proveedor', valor: c.proveedores?.nombre },
    { label: 'Fecha', valor: formatearFecha(c.fecha) },
    { label: 'Odómetro', valor: c.odometro },
    { label: 'Cantidad', valor: c.cantidad },
    { label: 'Costo unitario', valor: c.costo_unitario },
    { label: 'Costo total', valor: c.costo_total }
  ]
})

function formatearFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

async function cargar() {
  const { data } = await client
    .from('cargas_combustible')
    .select('*, vehiculos(placa, marca, modelo), proveedores(nombre)')
    .eq('id', cargaId)
    .maybeSingle()
  carga.value = data as unknown as CargaListado | null
}

onMounted(async () => {
  cargando.value = true
  await cargar()
  cargando.value = false
})
</script>
