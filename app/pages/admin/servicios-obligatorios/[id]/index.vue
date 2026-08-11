<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">
          {{ servicio ? etiquetaTipo(servicio.tipo) : 'Servicio obligatorio' }}
        </h1>
        <div v-if="servicio" class="d-flex align-center ga-2 mt-1">
          <p class="text-metadata text-medium-emphasis">
            {{ servicio.vehiculos?.marca }} {{ servicio.vehiculos?.modelo }} —
            {{ servicio.vehiculos?.placa }}
          </p>
          <v-chip
            :color="estadoServicio(servicio.fecha_vencimiento).color"
            size="small"
            data-testid="vigencia-chip"
          >
            {{ estadoServicio(servicio.fecha_vencimiento).texto }}
          </v-chip>
        </div>
      </div>
      <div v-if="servicio && puedeEscribir" class="d-flex ga-2">
        <v-btn
          variant="outlined"
          data-testid="editar-btn"
          :to="`/admin/servicios-obligatorios/${servicioId}/editar`"
        >
          Editar
        </v-btn>
        <v-btn
          variant="outlined"
          color="error"
          data-testid="eliminar-btn"
          @click="dialogoEliminarAbierto = true"
        >
          Eliminar
        </v-btn>
      </div>
    </div>

    <CatalogosDialogoConfirmarEliminarCatalogo
      v-model="dialogoEliminarAbierto"
      etiqueta-entidad="servicio obligatorio"
      :nombre="servicio ? etiquetaTipo(servicio.tipo) : ''"
      :eliminando="eliminando"
      @confirmar="onEliminar"
    />

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-alert v-else-if="!servicio" type="error" data-testid="servicio-no-encontrado">
      No se encontró ese servicio obligatorio en tu empresa.
    </v-alert>

    <template v-else>
      <v-row>
        <v-col cols="12" md="6">
          <v-card class="app-card-shadow mb-4" variant="flat" data-testid="tarjeta-datos">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-clipboard-check-outline" color="primary" class="mr-2" />
                Datos del servicio
              </h2>
              <v-row>
                <v-col v-for="campo in campos" :key="campo.label" cols="6">
                  <p class="text-label-caps text-medium-emphasis">{{ campo.label }}</p>
                  <p class="text-body-main mt-2">{{ campo.valor ?? '—' }}</p>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <v-card class="app-card-shadow mb-4" variant="flat" data-testid="comprobante-seccion">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-file-certificate-outline" color="primary" class="mr-2" />
                Comprobante
              </h2>

              <v-alert v-if="!comprobante" type="info" density="compact" data-testid="sin-comprobante">
                Este servicio no tiene ningún comprobante adjunto todavía.
              </v-alert>
              <div v-else class="d-flex align-center justify-space-between flex-wrap ga-2">
                <span class="text-body-main">{{ nombreArchivo(comprobante.storage_path) }}</span>
                <div class="d-flex ga-1">
                  <v-btn
                    variant="text"
                    size="small"
                    color="primary"
                    prepend-icon="mdi-eye-outline"
                    data-testid="ver-comprobante-btn"
                    @click="ver"
                  >
                    Ver
                  </v-btn>
                  <v-btn
                    variant="text"
                    size="small"
                    color="primary"
                    prepend-icon="mdi-download-outline"
                    data-testid="descargar-comprobante-btn"
                    @click="descargar"
                  >
                    Descargar
                  </v-btn>
                </div>
              </div>

              <v-btn
                variant="outlined"
                size="small"
                class="mt-4"
                prepend-icon="mdi-tray-arrow-up"
                data-testid="adjuntar-comprobante-btn"
                @click="triggerFileInput"
              >
                {{ comprobante ? 'Reemplazar comprobante' : 'Adjuntar comprobante' }}
              </v-btn>
              <input
                ref="inputFileRef"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                class="d-none"
                data-testid="adjuntar-comprobante-input"
                @change="onFileInputChange"
              />
              <v-messages v-if="errorArchivo" :messages="[errorArchivo]" color="error" active />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ServicioListado, ArchivoRow } from '~/composables/useServiciosObligatorios'
import { etiquetaTipo, estadoServicio } from '~/utils/servicios-obligatorios'
import { validarArchivo } from '~/utils/archivos'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const servicioId = route.params.id as string

const client = useSupabaseClient<Database>()
const {
  adjuntarComprobante,
  obtenerComprobante,
  descargarArchivo,
  verArchivo,
  eliminar,
  error: errorServicios
} = useServiciosObligatorios()
const { tienePermiso } = usePermisos()

const puedeEscribir = computed(() => tienePermiso('servicios_obligatorios', 'editar'))

const cargando = ref(true)
const servicio = ref<ServicioListado | null>(null)
const comprobante = ref<ArchivoRow | null>(null)

const dialogoEliminarAbierto = ref(false)
const eliminando = ref(false)

async function onEliminar() {
  eliminando.value = true
  try {
    await eliminar(servicioId)
    await navigateTo('/admin/servicios-obligatorios')
  } catch {
    dialogoEliminarAbierto.value = false
  } finally {
    eliminando.value = false
  }
}

const campos = computed(() => {
  const s = servicio.value
  if (!s) return []
  return [
    { label: 'Tipo', valor: etiquetaTipo(s.tipo) },
    { label: 'Fecha de realización', valor: formatearFecha(s.fecha_realizado) },
    { label: 'Fecha de vencimiento', valor: formatearFecha(s.fecha_vencimiento) }
  ]
})

function formatearFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function nombreArchivo(storagePath: string): string {
  return storagePath.split('/').pop() ?? storagePath
}

async function cargar() {
  const { data } = await client
    .from('servicios_obligatorios')
    .select('*, vehiculos(placa, marca, modelo)')
    .eq('id', servicioId)
    .maybeSingle()
  servicio.value = data as unknown as ServicioListado | null
  comprobante.value = servicio.value ? await obtenerComprobante(servicioId) : null
}

onMounted(async () => {
  cargando.value = true
  await cargar()
  cargando.value = false
})

async function ver() {
  if (!comprobante.value) return
  const url = await verArchivo(comprobante.value.storage_path)
  window.open(url, '_blank', 'noopener')
}

async function descargar() {
  if (!comprobante.value) return
  const url = await descargarArchivo(comprobante.value.storage_path, nombreArchivo(comprobante.value.storage_path))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = ''
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
}

const inputFileRef = ref<HTMLInputElement>()
const errorArchivo = ref('')

function triggerFileInput() {
  inputFileRef.value?.click()
}

async function onFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const archivo = input.files?.[0]
  errorArchivo.value = ''
  if (!archivo) return

  const mensaje = validarArchivo(archivo)
  if (mensaje) {
    errorArchivo.value = mensaje
    input.value = ''
    return
  }

  try {
    await adjuntarComprobante(servicioId, archivo)
    await cargar()
  } catch {
    errorArchivo.value = errorServicios.value ?? 'No se pudo subir el comprobante.'
  } finally {
    input.value = ''
  }
}
</script>
