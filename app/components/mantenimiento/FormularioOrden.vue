<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-wrench-outline" color="primary" class="mr-2" />
          Datos de la orden
        </h2>

        <v-row>
          <v-col cols="12" md="4">
            <v-select
              v-model="valores.tipo"
              label="Tipo"
              :items="[
                { title: 'Correctivo', value: 'correctivo' },
                { title: 'Preventivo', value: 'preventivo' }
              ]"
              :rules="[reglas.requerido]"
              required
              data-testid="tipo-select"
            />
          </v-col>
          <v-col cols="12" md="4">
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
          <v-col cols="12" md="4">
            <v-autocomplete
              v-model="valores.proveedor_id"
              label="Proveedor"
              :items="proveedores"
              item-title="nombre"
              item-value="id"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="valores.fecha"
              label="Fecha"
              type="date"
              :max="hoy"
              :rules="[reglas.requerido, reglas.fechaNoFutura]"
              required
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="valores.costo_total"
              label="Costo total"
              type="number"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12">
            <v-textarea v-model="valores.notas" label="Notas" rows="2" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <div class="d-flex align-center justify-space-between mb-4">
          <h2 class="text-section-title d-flex align-center">
            <v-icon icon="mdi-format-list-bulleted" color="primary" class="mr-2" />
            Líneas
          </h2>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-plus"
            data-testid="agregar-linea-btn"
            @click="agregarLinea"
          >
            Agregar línea
          </v-btn>
        </div>

        <v-alert v-if="lineas.length === 0" type="info" density="compact" data-testid="sin-lineas">
          Agrega al menos una línea para poder guardar la orden.
        </v-alert>

        <v-card
          v-for="(linea, index) in lineas"
          :key="linea.clave"
          class="mb-4"
          variant="outlined"
          :data-testid="`linea-${index}`"
        >
          <v-card-text>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-label-caps text-medium-emphasis">Línea {{ index + 1 }}</span>
              <v-btn
                icon="mdi-delete-outline"
                size="small"
                variant="text"
                :data-testid="`linea-${index}-quitar`"
                @click="quitarLinea(index)"
              />
            </div>
            <v-row>
              <v-col cols="12" md="6">
                <v-autocomplete
                  v-model="linea.productoId"
                  :label="`Producto de la línea ${index + 1}`"
                  :items="productosOpciones"
                  item-title="nombre"
                  item-value="id"
                  :rules="[reglas.requerido]"
                  required
                />
              </v-col>
            </v-row>

            <template v-if="tipoProducto(linea.productoId) === 'llanta'">
              <v-row>
                <v-col cols="12" md="3">
                  <v-text-field v-model="linea.llantaMarca" :label="`Marca de la línea ${index + 1}`" />
                </v-col>
                <v-col cols="12" md="3">
                  <v-text-field v-model="linea.llantaMedida" :label="`Medida de la línea ${index + 1}`" />
                </v-col>
                <v-col cols="12" md="3">
                  <v-text-field
                    v-model="linea.llantaNumeroSerie"
                    :label="`Número de serie de la línea ${index + 1}`"
                  />
                </v-col>
                <v-col cols="12" md="3">
                  <v-select
                    v-model="linea.llantaCondicion"
                    :label="`Condición de la línea ${index + 1}`"
                    :items="[
                      { title: 'Nueva', value: 'nueva' },
                      { title: 'Renovada', value: 'renovada' }
                    ]"
                    :data-testid="`linea-${index}-condicion`"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field
                    v-model="linea.llantaKilometraje"
                    :label="`Kilometraje actual de la línea ${index + 1}`"
                    type="number"
                  />
                </v-col>
              </v-row>
            </template>

            <template v-else-if="tipoProducto(linea.productoId) === 'servicio'">
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="linea.servicioFechaProximo"
                    :label="`Fecha de próximo servicio de la línea ${index + 1}`"
                    type="date"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="linea.servicioFrecuenciaKm"
                    :label="`Frecuencia (km) de la línea ${index + 1}`"
                    type="number"
                  />
                </v-col>
              </v-row>
            </template>

            <template v-else-if="tipoProducto(linea.productoId) === 'refaccion' || tipoProducto(linea.productoId) === 'consumible'">
              <v-row>
                <v-col cols="12" md="4">
                  <v-text-field
                    v-model="linea.cantidad"
                    :label="`Cantidad de la línea ${index + 1}`"
                    type="number"
                  />
                </v-col>
              </v-row>
            </template>
          </v-card-text>
        </v-card>
      </v-card-text>
    </v-card>

    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <div
          class="factura-dropzone"
          role="button"
          tabindex="0"
          aria-label="Adjuntar factura"
          @click="triggerFileInput"
          @keydown.enter="triggerFileInput"
          @keydown.space.prevent="triggerFileInput"
        >
          <v-icon icon="mdi-file-upload-outline" size="32" color="grey" />
          <p class="text-metadata text-medium-emphasis text-center mt-2">
            {{ archivoSeleccionado ? archivoSeleccionado.name : 'Adjuntar factura (PDF, JPG o PNG)' }}
          </p>
          <p class="text-label-caps text-medium-emphasis mt-1">Tamaño máximo 10 MB</p>
          <input
            ref="inputFileRef"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            class="d-none"
            data-testid="factura-input"
            @change="onFileInputChange"
          />
        </div>
        <v-messages v-if="errorArchivo" :messages="[errorArchivo]" color="error" active />
      </v-card-text>
    </v-card>

    <v-alert v-if="errorLineas" type="error" class="mb-4" data-testid="lineas-error">
      {{ errorLineas }}
    </v-alert>
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
import type { Database } from '~/types/database.types'
import type { LineaValores } from '~/composables/useMantenimientos'

type OrdenValores = Omit<
  Database['public']['Tables']['mantenimientos']['Insert'],
  'empresa_id' | 'creado_por'
>
type TipoProducto = Database['public']['Enums']['tipo_producto']

withDefaults(
  defineProps<{
    enviando?: boolean
    errorExterno?: string | null
    errorLineas?: string | null
  }>(),
  { enviando: false, errorExterno: null, errorLineas: null }
)

const emit = defineEmits<{
  enviar: [valores: OrdenValores, lineas: LineaValores[], archivo: File | null]
}>()

const { listar: listarVehiculos, registros: vehiculos } = useVehiculos()
const { listar: listarProveedores, registros: proveedores } = useProveedores()
const { listar: listarProductos, registros: productos } = useProductos()

onMounted(async () => {
  await Promise.all([listarVehiculos(), listarProveedores(), listarProductos()])
})

const vehiculosOpciones = computed(() =>
  vehiculos.value.map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo} — ${v.placa}` }))
)
// El selector de producto de cada línea excluye tipo combustible en el cliente (research.md R5).
const productosOpciones = computed(() => productos.value.filter((p) => p.tipo !== 'combustible'))

function tipoProducto(productoId: string): TipoProducto | null {
  return productos.value.find((p) => p.id === productoId)?.tipo ?? null
}

const hoy = new Date().toISOString().slice(0, 10)

const valores = reactive({
  tipo: '' as Database['public']['Enums']['tipo_mantenimiento'] | '',
  vehiculo_id: '',
  proveedor_id: '',
  fecha: hoy,
  costo_total: '' as number | string,
  notas: ''
})

type LineaFormulario = {
  clave: number
  productoId: string
  cantidad: number | string
  llantaMarca: string
  llantaMedida: string
  llantaNumeroSerie: string
  llantaCondicion: Database['public']['Enums']['condicion_llanta'] | ''
  llantaKilometraje: number | string
  servicioFechaProximo: string
  servicioFrecuenciaKm: number | string
}

let claveSiguiente = 0
const lineas = ref<LineaFormulario[]>([])

function agregarLinea() {
  lineas.value.push({
    clave: claveSiguiente++,
    productoId: '',
    cantidad: '',
    llantaMarca: '',
    llantaMedida: '',
    llantaNumeroSerie: '',
    llantaCondicion: '',
    llantaKilometraje: '',
    servicioFechaProximo: '',
    servicioFrecuenciaKm: ''
  })
}

function quitarLinea(index: number) {
  lineas.value.splice(index, 1)
}

const reglas = {
  requerido: (v: string) => (v !== '' && v !== null && v !== undefined) || 'Campo requerido.',
  fechaNoFutura: (v: string) => !v || v <= hoy || 'La fecha no puede ser posterior a hoy.'
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

function numOrNull(v: number | string): number | null {
  return v === '' || v === null || v === undefined ? null : Number(v)
}

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return
  if (lineas.value.length === 0) return

  const payload: OrdenValores = {
    tipo: valores.tipo as Database['public']['Enums']['tipo_mantenimiento'],
    vehiculo_id: valores.vehiculo_id,
    proveedor_id: valores.proveedor_id,
    fecha: valores.fecha,
    costo_total: Number(valores.costo_total),
    notas: valores.notas || null
  }

  const lineasPayload: LineaValores[] = lineas.value.map((l) => {
    const tipo = tipoProducto(l.productoId)
    return {
      producto_id: l.productoId,
      cantidad: tipo === 'refaccion' || tipo === 'consumible' ? numOrNull(l.cantidad) : null,
      llanta_marca: tipo === 'llanta' ? l.llantaMarca || null : null,
      llanta_medida: tipo === 'llanta' ? l.llantaMedida || null : null,
      llanta_numero_serie: tipo === 'llanta' ? l.llantaNumeroSerie || null : null,
      llanta_condicion: tipo === 'llanta' ? l.llantaCondicion || null : null,
      llanta_kilometraje: tipo === 'llanta' ? numOrNull(l.llantaKilometraje) : null,
      servicio_fecha_proximo: tipo === 'servicio' ? l.servicioFechaProximo || null : null,
      servicio_frecuencia_km: tipo === 'servicio' ? numOrNull(l.servicioFrecuenciaKm) : null
    }
  })

  emit('enviar', payload, lineasPayload, archivoSeleccionado.value)
}
</script>

<style scoped>
.factura-dropzone {
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
