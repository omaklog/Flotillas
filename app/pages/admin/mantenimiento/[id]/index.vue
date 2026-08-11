<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">
          {{ orden ? `Orden de mantenimiento — ${formatearFecha(orden.fecha)}` : 'Orden de mantenimiento' }}
        </h1>
        <div v-if="orden" class="d-flex align-center ga-2 mt-1">
          <p class="text-metadata text-medium-emphasis">
            {{ orden.vehiculos?.marca }} {{ orden.vehiculos?.modelo }} — {{ orden.vehiculos?.placa }}
            · {{ orden.tipo === 'correctivo' ? 'Correctivo' : 'Preventivo' }}
          </p>
          <v-chip
            :color="orden.estado === 'cancelado' ? 'grey' : 'success'"
            size="small"
            data-testid="estado-chip"
          >
            {{ orden.estado === 'cancelado' ? 'Cancelada' : 'Activa' }}
          </v-chip>
        </div>
      </div>
      <v-btn
        v-if="orden && orden.estado === 'activo' && tienePermiso('mantenimiento', 'cancelar')"
        variant="outlined"
        color="error"
        data-testid="cancelar-btn"
        @click="dialogoCancelarAbierto = true"
      >
        Cancelar
      </v-btn>
    </div>

    <MantenimientoDialogoCancelarOrden
      v-model="dialogoCancelarAbierto"
      :enviando="cancelando"
      :error-externo="errorCancelar"
      @confirmar="onCancelar"
    />

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-alert v-else-if="!orden" type="error" data-testid="orden-no-encontrada">
      No se encontró esa orden de mantenimiento en tu empresa.
    </v-alert>

    <template v-else>
      <v-row>
        <v-col cols="12" md="6">
          <v-card class="app-card-shadow mb-4" variant="flat" data-testid="tarjeta-datos">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-wrench-outline" color="primary" class="mr-2" />
                Datos de la orden
              </h2>
              <v-row>
                <v-col v-for="campo in campos" :key="campo.label" cols="6">
                  <p class="text-label-caps text-medium-emphasis">{{ campo.label }}</p>
                  <p class="text-body-main mt-2">{{ campo.valor ?? '—' }}</p>
                </v-col>
              </v-row>
              <template v-if="orden.estado === 'cancelado'">
                <v-divider class="my-4" />
                <p class="text-label-caps text-medium-emphasis">Motivo de cancelación</p>
                <p class="text-body-main mt-2" data-testid="motivo-cancelacion">
                  {{ orden.motivo_cancelacion }}
                </p>
              </template>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <MantenimientoHistorialFactura
            :key="orden.factura_archivo_id ?? 'sin-factura'"
            :mantenimiento-id="orden.id"
            :factura-vigente-id="orden.factura_archivo_id"
            :activo="orden.estado === 'activo'"
            @subida="cargar"
          />
        </v-col>

        <v-col cols="12">
          <v-card class="app-card-shadow" variant="flat" data-testid="tarjeta-lineas">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-format-list-bulleted" color="primary" class="mr-2" />
                Líneas ({{ lineas.length }})
              </h2>
              <v-table data-testid="lineas-tabla">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Tipo</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="linea in lineas" :key="linea.id" :data-testid="`linea-detalle-${linea.id}`">
                    <td>{{ linea.productos?.nombre }}</td>
                    <td>{{ etiquetaTipoProducto(linea.productos?.tipo) }}</td>
                    <td>{{ detalleLinea(linea) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MantenimientoListado } from '~/composables/useMantenimientos'

definePageMeta({ layout: 'admin' })

type LineaConProducto = Database['public']['Tables']['mantenimiento_detalles']['Row'] & {
  productos: { nombre: string; tipo: Database['public']['Enums']['tipo_producto'] } | null
}

const route = useRoute()
const mantenimientoId = route.params.id as string

const client = useSupabaseClient<Database>()
const { tienePermiso } = usePermisos()
const { cancelar, error: errorMantenimientos } = useMantenimientos()

const cargando = ref(true)
const orden = ref<MantenimientoListado | null>(null)
const lineas = ref<LineaConProducto[]>([])

const dialogoCancelarAbierto = ref(false)
const cancelando = ref(false)
const errorCancelar = ref<string | null>(null)

const campos = computed(() => {
  const o = orden.value
  if (!o) return []
  return [
    { label: 'Proveedor', valor: o.proveedores?.nombre },
    { label: 'Fecha', valor: formatearFecha(o.fecha) },
    { label: 'Costo total', valor: o.costo_total },
    { label: 'Notas', valor: o.notas }
  ]
})

function formatearFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function etiquetaTipoProducto(tipo?: Database['public']['Enums']['tipo_producto']): string {
  const etiquetas: Record<string, string> = {
    llanta: 'Llanta',
    servicio: 'Servicio',
    refaccion: 'Refacción',
    consumible: 'Producto'
  }
  return tipo ? (etiquetas[tipo] ?? tipo) : '—'
}

function detalleLinea(linea: LineaConProducto): string {
  const tipo = linea.productos?.tipo
  if (tipo === 'llanta') {
    return [linea.llanta_marca, linea.llanta_medida, linea.llanta_numero_serie, linea.llanta_condicion]
      .filter(Boolean)
      .join(' · ')
  }
  if (tipo === 'servicio') {
    return [
      linea.servicio_fecha_proximo ? `Próximo: ${linea.servicio_fecha_proximo}` : null,
      linea.servicio_frecuencia_km ? `${linea.servicio_frecuencia_km} km` : null
    ]
      .filter(Boolean)
      .join(' · ')
  }
  return linea.cantidad !== null ? `Cantidad: ${linea.cantidad}` : '—'
}

async function cargar() {
  const { data } = await client
    .from('mantenimientos')
    .select('*, vehiculos(placa, marca, modelo), proveedores(nombre), mantenimiento_detalles(count)')
    .eq('id', mantenimientoId)
    .maybeSingle()
  orden.value = data as unknown as MantenimientoListado | null

  if (orden.value) {
    const { data: detalles } = await client
      .from('mantenimiento_detalles')
      .select('*, productos(nombre, tipo)')
      .eq('mantenimiento_id', mantenimientoId)
    lineas.value = (detalles ?? []) as unknown as LineaConProducto[]
  }
}

onMounted(async () => {
  cargando.value = true
  await cargar()
  cargando.value = false
})

async function onCancelar(motivo: string) {
  cancelando.value = true
  errorCancelar.value = null
  try {
    await cancelar(mantenimientoId, motivo)
    dialogoCancelarAbierto.value = false
    await cargar()
  } catch {
    errorCancelar.value = errorMantenimientos.value ?? 'No se pudo cancelar la orden de mantenimiento.'
  } finally {
    cancelando.value = false
  }
}
</script>
