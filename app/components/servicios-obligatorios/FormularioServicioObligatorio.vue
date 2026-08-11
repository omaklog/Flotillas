<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-clipboard-check-outline" color="primary" class="mr-2" />
          Datos del servicio
        </h2>

        <v-row>
          <v-col cols="12" md="6">
            <v-autocomplete
              v-model="valores.vehiculo_id"
              label="Vehículo"
              :items="vehiculosOpciones"
              item-title="label"
              item-value="id"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="valores.tipo"
              label="Tipo de servicio"
              :items="tiposServicio"
              item-title="title"
              item-value="value"
              :rules="[reglas.requerido]"
              required
              data-testid="tipo-select"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.fecha_realizado"
              label="Fecha de realización"
              type="date"
              :max="hoy"
              :rules="[reglas.requerido, reglas.fechaRealizadoNoFutura]"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.fecha_vencimiento"
              label="Fecha de vencimiento"
              type="date"
              :rules="[reglas.requerido, reglas.vencimientoPosteriorARealizado]"
              required
            />
          </v-col>
        </v-row>

        <div
          class="comprobante-dropzone mt-4"
          role="button"
          tabindex="0"
          aria-label="Adjuntar comprobante"
          @click="triggerFileInput"
          @keydown.enter="triggerFileInput"
          @keydown.space.prevent="triggerFileInput"
        >
          <v-icon icon="mdi-file-upload-outline" size="32" color="grey" />
          <p class="text-metadata text-medium-emphasis text-center mt-2">
            {{ archivoSeleccionado ? archivoSeleccionado.name : 'Adjuntar comprobante (PDF, JPG o PNG, opcional)' }}
          </p>
          <p class="text-label-caps text-medium-emphasis mt-1">Tamaño máximo 10 MB</p>
          <input
            ref="inputFileRef"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            class="d-none"
            data-testid="comprobante-input"
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
import { validarArchivo } from '~/utils/archivos'
import { tiposServicio } from '~/utils/servicios-obligatorios'
import type { Database } from '~/types/database.types'
import type { ServicioRow } from '~/composables/useServiciosObligatorios'

type ServicioValores = Omit<Database['public']['Tables']['servicios_obligatorios']['Insert'], 'empresa_id'>

const props = withDefaults(
  defineProps<{
    registro?: ServicioRow
    enviando?: boolean
    errorExterno?: string | null
  }>(),
  { registro: undefined, enviando: false, errorExterno: null }
)

const emit = defineEmits<{
  enviar: [valores: ServicioValores, archivo: File | null]
}>()

const { listar: listarVehiculos, registros: vehiculos } = useVehiculos()

onMounted(async () => {
  await listarVehiculos()
})

const vehiculosOpciones = computed(() =>
  vehiculos.value.map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo} — ${v.placa}` }))
)

const hoy = new Date().toISOString().slice(0, 10)

const valores = reactive({
  vehiculo_id: props.registro?.vehiculo_id ?? '',
  tipo: (props.registro?.tipo ?? '') as Database['public']['Enums']['tipo_servicio_obligatorio'] | '',
  fecha_realizado: props.registro?.fecha_realizado ?? hoy,
  fecha_vencimiento: props.registro?.fecha_vencimiento ?? ''
})

const reglas = {
  requerido: (v: string) => (v !== '' && v !== null && v !== undefined) || 'Campo requerido.',
  fechaRealizadoNoFutura: (v: string) =>
    !v || v <= hoy || 'La fecha de realización no puede ser posterior a hoy.',
  vencimientoPosteriorARealizado: (v: string) =>
    !v ||
    !valores.fecha_realizado ||
    v > valores.fecha_realizado ||
    'La fecha de vencimiento debe ser posterior a la fecha de realización.'
}

const formRef = ref()
const inputFileRef = ref<HTMLInputElement>()
const archivoSeleccionado = ref<File | null>(null)
const errorArchivo = ref('')

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

  const payload: ServicioValores = {
    vehiculo_id: valores.vehiculo_id,
    tipo: valores.tipo as Database['public']['Enums']['tipo_servicio_obligatorio'],
    fecha_realizado: valores.fecha_realizado,
    fecha_vencimiento: valores.fecha_vencimiento
  }
  emit('enviar', payload, archivoSeleccionado.value)
}
</script>

<style scoped>
.comprobante-dropzone {
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
