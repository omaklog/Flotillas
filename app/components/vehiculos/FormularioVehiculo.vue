<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-car-outline" color="primary" class="mr-2" />
          Datos del vehículo
        </h2>

        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.marca"
              label="Marca"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.modelo"
              label="Modelo"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="valores.placa"
              label="Placa"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field v-model="valores.color" label="Color" />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field v-model="valores.anio" label="Año" type="number" />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="valores.numero_serie" label="Número de serie" />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="valores.numero_motor" label="Número de motor" />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="valores.capacidad_carga" label="Capacidad de carga" type="number" />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="valores.numero_ejes" label="Número de ejes" type="number" />
          </v-col>
          <v-col cols="12" md="6">
            <!-- v-autocomplete, no v-select: mismo criterio que PermisosVehiculo.vue — el
            catálogo de tipos de vehículo crece sin límite por empresa y Vuetify virtualiza los
            v-select largos (los ítems fuera del rango visible no existen en el DOM hasta hacer
            scroll). -->
            <v-autocomplete
              v-model="valores.tipo_vehiculo_id"
              label="Tipo de vehículo"
              :items="tiposVehiculo.registros.value"
              item-title="nombre"
              item-value="id"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-shield-car" color="primary" class="mr-2" />
          Seguro y póliza
        </h2>

        <v-row>
          <v-col cols="12" md="6">
            <!-- v-autocomplete: mismo motivo que "Tipo de vehículo" arriba — el catálogo de
            aseguradoras también crece sin límite. -->
            <v-autocomplete
              v-model="valores.aseguradora_id"
              label="Aseguradora"
              :items="aseguradoras.registros.value"
              item-title="razon_social"
              item-value="id"
              clearable
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="valores.numero_poliza" label="Número de póliza" />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.fecha_vencimiento_poliza"
              label="Fecha de vencimiento de póliza"
              type="date"
            />
          </v-col>
        </v-row>

        <div
          class="poliza-dropzone mt-2"
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
            data-testid="poliza-input"
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

type VehiculoRow = Database['public']['Tables']['vehiculos']['Row']
type VehiculoValores = Omit<
  Database['public']['Tables']['vehiculos']['Insert'],
  'empresa_id' | 'poliza_archivo_id'
>

const props = withDefaults(
  defineProps<{
    registro?: VehiculoRow
    enviando?: boolean
    errorExterno?: string | null
  }>(),
  { registro: undefined, enviando: false, errorExterno: null }
)

const emit = defineEmits<{ enviar: [valores: VehiculoValores, archivo: File | null] }>()

const tiposVehiculo = useCatalogo('tipos_vehiculo', {
  camposBusqueda: ['nombre'],
  ordenarPor: 'nombre',
  mensajeDependientes: ''
})
const aseguradoras = useCatalogo('aseguradoras', {
  camposBusqueda: ['razon_social'],
  ordenarPor: 'razon_social',
  mensajeDependientes: ''
})

onMounted(() => {
  tiposVehiculo.listar()
  aseguradoras.listar()
})

const formRef = ref()
const inputFileRef = ref<HTMLInputElement>()
const archivoSeleccionado = ref<File | null>(null)
const errorArchivo = ref('')

const valores = reactive({
  marca: props.registro?.marca ?? '',
  modelo: props.registro?.modelo ?? '',
  placa: props.registro?.placa ?? '',
  color: props.registro?.color ?? '',
  numero_serie: props.registro?.numero_serie ?? '',
  numero_motor: props.registro?.numero_motor ?? '',
  capacidad_carga: (props.registro?.capacidad_carga ?? '') as number | string,
  anio: (props.registro?.anio ?? '') as number | string,
  numero_ejes: (props.registro?.numero_ejes ?? '') as number | string,
  tipo_vehiculo_id: props.registro?.tipo_vehiculo_id ?? '',
  aseguradora_id: props.registro?.aseguradora_id ?? '',
  numero_poliza: props.registro?.numero_poliza ?? '',
  fecha_vencimiento_poliza: props.registro?.fecha_vencimiento_poliza ?? ''
})

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido.'
}

function numOrNull(v: number | string): number | null {
  return v === '' || v === null || v === undefined ? null : Number(v)
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

  const payload: VehiculoValores = {
    marca: valores.marca,
    modelo: valores.modelo,
    placa: valores.placa,
    color: valores.color || null,
    numero_serie: valores.numero_serie || null,
    numero_motor: valores.numero_motor || null,
    capacidad_carga: numOrNull(valores.capacidad_carga),
    anio: numOrNull(valores.anio),
    numero_ejes: numOrNull(valores.numero_ejes),
    tipo_vehiculo_id: valores.tipo_vehiculo_id,
    aseguradora_id: valores.aseguradora_id || null,
    numero_poliza: valores.numero_poliza || null,
    fecha_vencimiento_poliza: valores.fecha_vencimiento_poliza || null
  }
  emit('enviar', payload, archivoSeleccionado.value)
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
