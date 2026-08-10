<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-card-account-details-outline" color="primary" class="mr-2" />
          Datos del conductor
        </h2>

        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.nombre"
              label="Nombre"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.apellidos"
              label="Apellidos"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="valores.celular" label="Celular" />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field v-model="valores.calle" label="Calle" />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field v-model="valores.numero" label="Número" />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field v-model="valores.colonia" label="Colonia" />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.numero_licencia"
              label="Número de licencia"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <!-- v-autocomplete, no v-select: mismo criterio que FormularioVehiculo.vue — el click
            de Playwright sobre el combobox de un v-select choca con un overlay interno
            (`data-no-activator`) que intercepta el evento; v-autocomplete no tiene ese problema
            y ya está probado en este mismo arnés de pruebas. -->
            <v-autocomplete
              v-model="valores.tipo_licencia"
              label="Tipo de licencia"
              :items="TIPOS_LICENCIA"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.fecha_vencimiento_licencia"
              label="Fecha de vencimiento"
              type="date"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
        </v-row>

        <div
          class="licencia-dropzone mt-2"
          role="button"
          tabindex="0"
          aria-label="Adjuntar licencia"
          @click="triggerFileInput"
          @keydown.enter="triggerFileInput"
          @keydown.space.prevent="triggerFileInput"
        >
          <v-icon icon="mdi-file-upload-outline" size="32" color="grey" />
          <p class="text-metadata text-medium-emphasis text-center mt-2">
            {{ archivoSeleccionado ? archivoSeleccionado.name : 'Adjuntar licencia (PDF, JPG o PNG)' }}
          </p>
          <p class="text-label-caps text-medium-emphasis mt-1">Tamaño máximo 10 MB</p>
          <input
            ref="inputFileRef"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            class="d-none"
            data-testid="licencia-input"
            @change="onFileInputChange"
          />
        </div>
        <v-messages v-if="errorArchivo" :messages="[errorArchivo]" color="error" active />
      </v-card-text>
    </v-card>

    <v-alert v-if="errorExterno" type="error" class="mb-4" data-testid="form-error">
      {{ errorExterno }}
    </v-alert>

    <v-btn type="submit" color="primary" :loading="enviando" data-testid="submit-btn">
      Guardar
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import { validarArchivo } from '~/utils/archivos'

type ConductorRow = Database['public']['Tables']['conductores']['Row']
type ConductorValores = Omit<
  Database['public']['Tables']['conductores']['Insert'],
  'empresa_id' | 'licencia_archivo_id'
>

const props = withDefaults(
  defineProps<{
    registro?: ConductorRow
    enviando?: boolean
    errorExterno?: string | null
  }>(),
  { registro: undefined, enviando: false, errorExterno: null }
)

const emit = defineEmits<{
  enviar: [valores: ConductorValores, archivoLicencia: File | null]
}>()

const TIPOS_LICENCIA = [
  { title: 'Federal', value: 'federal' },
  { title: 'Local', value: 'local' }
]

const formRef = ref()
const inputFileRef = ref<HTMLInputElement>()
const archivoSeleccionado = ref<File | null>(null)
const errorArchivo = ref('')

const valores = reactive({
  nombre: props.registro?.nombre ?? '',
  apellidos: props.registro?.apellidos ?? '',
  celular: props.registro?.celular ?? '',
  calle: props.registro?.calle ?? '',
  numero: props.registro?.numero ?? '',
  colonia: props.registro?.colonia ?? '',
  numero_licencia: props.registro?.numero_licencia ?? '',
  tipo_licencia: props.registro?.tipo_licencia ?? ('federal' as 'federal' | 'local'),
  fecha_vencimiento_licencia: props.registro?.fecha_vencimiento_licencia ?? ''
})

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido.'
}

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

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  const payload: ConductorValores = {
    nombre: valores.nombre,
    apellidos: valores.apellidos,
    celular: valores.celular || null,
    calle: valores.calle || null,
    numero: valores.numero || null,
    colonia: valores.colonia || null,
    numero_licencia: valores.numero_licencia,
    tipo_licencia: valores.tipo_licencia,
    fecha_vencimiento_licencia: valores.fecha_vencimiento_licencia
  }
  emit('enviar', payload, archivoSeleccionado.value)
}
</script>

<style scoped>
.licencia-dropzone {
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
