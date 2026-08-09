<template>
  <v-card class="app-card-shadow" variant="flat" data-testid="historial-poliza-card">
    <v-card-text>
      <div class="d-flex align-center justify-space-between flex-wrap ga-4 mb-4">
        <h2 class="text-section-title">Historial de Pólizas de Seguro</h2>
        <v-btn
          variant="flat"
          color="primary"
          prepend-icon="mdi-tray-arrow-up"
          data-testid="subir-poliza-btn"
          @click="dialogoAbierto = true"
        >
          Subir Nueva Póliza
        </v-btn>
      </div>

      <v-skeleton-loader v-if="cargando" type="table" />

      <v-table v-else data-testid="historial-poliza-tabla">
        <thead>
          <tr>
            <th class="text-label-caps text-medium-emphasis">Versión / Fecha</th>
            <th class="text-label-caps text-medium-emphasis">Estado</th>
            <th class="text-label-caps text-medium-emphasis">Subido por</th>
            <th class="text-label-caps text-medium-emphasis text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="version in versiones"
            :key="version.id"
            :data-testid="`historial-poliza-item-${version.id}`"
          >
            <td>{{ formatearFecha(version.created_at) }}</td>
            <td>
              <v-chip
                :color="version.id === polizaVigenteId ? 'success' : 'default'"
                size="small"
                :data-testid="`estado-${version.id}`"
              >
                {{ version.id === polizaVigenteId ? 'Vigente' : 'Anterior' }}
              </v-chip>
            </td>
            <td>
              <div>{{ version.usuarios?.nombre ?? 'Desconocido' }}</div>
              <div class="text-metadata text-medium-emphasis">
                {{ formatearFechaHora(version.created_at) }}
              </div>
            </td>
            <td>
              <div class="d-flex justify-end ga-1">
                <v-btn
                  variant="text"
                  size="small"
                  color="primary"
                  prepend-icon="mdi-eye-outline"
                  :data-testid="`ver-btn-${version.id}`"
                  @click="ver(version)"
                >
                  Ver
                </v-btn>
                <v-btn
                  variant="text"
                  size="small"
                  color="primary"
                  prepend-icon="mdi-download-outline"
                  :data-testid="`descargar-btn-${version.id}`"
                  @click="descargar(version)"
                >
                  Descargar
                </v-btn>
              </div>
            </td>
          </tr>
          <tr v-if="versiones.length === 0">
            <td colspan="4" class="text-center text-medium-emphasis">
              Sin versiones de póliza registradas.
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card-text>

    <v-dialog v-model="dialogoAbierto" max-width="480">
      <v-card class="app-modal-shadow" variant="flat">
        <v-card-title class="text-section-title">Subir nueva póliza</v-card-title>
        <v-card-text>
          <div
            class="poliza-dropzone"
            role="button"
            tabindex="0"
            aria-label="Adjuntar póliza"
            @click="triggerFileInput"
            @keydown.enter="triggerFileInput"
            @keydown.space.prevent="triggerFileInput"
          >
            <v-icon icon="mdi-file-upload-outline" size="32" color="grey" />
            <p class="text-metadata text-medium-emphasis text-center mt-2">
              {{ archivoSeleccionado ? archivoSeleccionado.name : 'Adjuntar póliza (PDF, JPG o PNG)' }}
            </p>
            <p class="text-label-caps text-medium-emphasis mt-1">Tamaño máximo 10 MB</p>
            <input
              ref="inputFileRef"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              class="d-none"
              data-testid="subir-poliza-input"
              @change="onFileInputChange"
            />
          </div>
          <v-messages v-if="errorArchivo" :messages="[errorArchivo]" color="error" active />
          <v-alert v-if="errorSubida" type="error" class="mt-4" density="compact">
            {{ errorSubida }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" data-testid="cancelar-subida-btn" @click="cerrarDialogo">
            Cancelar
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="subiendo"
            :disabled="!archivoSeleccionado"
            data-testid="confirmar-subida-btn"
            @click="onSubirVersion"
          >
            Subir
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import type { ArchivoRow } from '~/composables/useVehiculos'
import { validarArchivo } from '~/utils/archivos'

const props = defineProps<{
  vehiculoId: string
  polizaVigenteId: string | null
}>()

const emit = defineEmits<{ subida: [] }>()

type VersionPoliza = ArchivoRow & { usuarios: { nombre: string } | null }

const {
  listarHistorialPoliza,
  descargarArchivo,
  verArchivo,
  adjuntarPoliza,
  error: errorVehiculos
} = useVehiculos()

const cargando = ref(true)
const versiones = ref<VersionPoliza[]>([])

async function cargar() {
  versiones.value = await listarHistorialPoliza(props.vehiculoId)
}

onMounted(async () => {
  cargando.value = true
  await cargar()
  cargando.value = false
})

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatearFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

async function descargar(version: VersionPoliza) {
  const url = await descargarArchivo(version.storage_path, `poliza-${version.id}.pdf`)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = ''
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
}

async function ver(version: VersionPoliza) {
  const url = await verArchivo(version.storage_path)
  window.open(url, '_blank', 'noopener')
}

const dialogoAbierto = ref(false)
const inputFileRef = ref<HTMLInputElement>()
const archivoSeleccionado = ref<File | null>(null)
const errorArchivo = ref('')
const errorSubida = ref('')
const subiendo = ref(false)

function triggerFileInput() {
  inputFileRef.value?.click()
}

function onFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const archivo = input.files?.[0]
  errorArchivo.value = ''
  if (!archivo) return

  const mensaje = validarArchivo(archivo)
  if (mensaje) {
    errorArchivo.value = mensaje
    archivoSeleccionado.value = null
    input.value = ''
    return
  }
  archivoSeleccionado.value = archivo
}

function cerrarDialogo() {
  dialogoAbierto.value = false
  archivoSeleccionado.value = null
  errorArchivo.value = ''
  errorSubida.value = ''
}

async function onSubirVersion() {
  if (!archivoSeleccionado.value) return
  subiendo.value = true
  errorSubida.value = ''
  try {
    await adjuntarPoliza(props.vehiculoId, archivoSeleccionado.value)
    cerrarDialogo()
    cargando.value = true
    await cargar()
    cargando.value = false
    emit('subida')
  } catch {
    errorSubida.value = errorVehiculos.value ?? 'No se pudo subir la nueva póliza.'
  } finally {
    subiendo.value = false
  }
}
</script>

<style scoped>
.poliza-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border: 1px dashed rgb(var(--v-theme-outline));
  border-radius: 8px;
  cursor: pointer;
}
</style>
