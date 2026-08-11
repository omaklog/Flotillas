<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-gas-station-outline" color="primary" class="mr-2" />
          Datos de la carga
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
            <v-autocomplete
              v-model="valores.proveedor_id"
              label="Proveedor"
              :items="proveedoresOpciones"
              item-title="nombre"
              item-value="id"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <template v-if="cargandoProductos || productosOpciones.length > 0">
              <v-autocomplete
                v-model="valores.producto_id"
                label="Producto"
                :items="productosOpciones"
                item-title="nombre"
                item-value="id"
                :rules="[reglas.requerido]"
                required
              />
            </template>
            <v-alert v-else type="warning" density="compact" data-testid="sin-productos-combustible">
              Esta empresa no tiene ningún producto de tipo combustible configurado. Crea uno en
              "Productos" antes de capturar una carga.
            </v-alert>
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.fecha"
              label="Fecha"
              type="date"
              :max="hoy"
              :rules="[reglas.requerido, reglas.fechaNoFutura]"
              required
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="valores.odometro"
              label="Odómetro"
              type="number"
              :rules="[reglas.requerido, reglas.odometroNoDecreciente]"
              required
            />
          </v-col>
          <v-col cols="12" md="6" />
          <v-col cols="12" md="4">
            <v-text-field
              v-model="valores.cantidad"
              label="Cantidad"
              type="number"
              :rules="[reglas.requerido]"
              required
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="valores.costo_unitario"
              label="Costo unitario"
              type="number"
              :rules="[reglas.requerido]"
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
        </v-row>

        <div
          class="factura-dropzone mt-4"
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

type CargaValores = Omit<
  Database['public']['Tables']['cargas_combustible']['Insert'],
  'empresa_id' | 'creado_por'
>

withDefaults(
  defineProps<{
    enviando?: boolean
    errorExterno?: string | null
  }>(),
  { enviando: false, errorExterno: null }
)

const emit = defineEmits<{
  enviar: [valores: CargaValores, archivo: File | null]
}>()

const { listar: listarVehiculos, registros: vehiculos } = useVehiculos()
const { listar: listarProveedores, registros: proveedores } = useProveedores()
const { listar: listarProductos, registros: productos } = useProductos()
const { obtenerUltimoOdometroActivo } = useCargasCombustible()

const cargandoProductos = ref(true)

onMounted(async () => {
  await Promise.all([listarVehiculos(), listarProveedores(), listarProductos('', 'combustible')])
  cargandoProductos.value = false
})

const vehiculosOpciones = computed(() =>
  vehiculos.value.map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo} — ${v.placa}` }))
)
const proveedoresOpciones = computed(() => proveedores.value)
const productosOpciones = computed(() => productos.value)

const hoy = new Date().toISOString().slice(0, 10)

const valores = reactive({
  vehiculo_id: '',
  proveedor_id: '',
  producto_id: '',
  fecha: hoy,
  odometro: '' as number | string,
  cantidad: '' as number | string,
  costo_unitario: '' as number | string,
  costo_total: '' as number | string
})

const ultimoOdometroActivo = ref<number | null>(null)

watch(
  () => valores.vehiculo_id,
  async (vehiculoId) => {
    ultimoOdometroActivo.value = vehiculoId ? await obtenerUltimoOdometroActivo(vehiculoId) : null
  }
)

// Costo total autocalculado (cantidad × costo_unitario), editable manualmente — el override
// solo "pega" hasta el siguiente cambio de cantidad/costo_unitario, que siempre lo vuelve a
// sobreescribir (FR-002, research.md R8; sin bandera de "manual" — el watcher es incondicional).
watch([() => valores.cantidad, () => valores.costo_unitario], ([cantidad, costoUnitario]) => {
  const c = Number(cantidad)
  const cu = Number(costoUnitario)
  if (cantidad !== '' && costoUnitario !== '' && !Number.isNaN(c) && !Number.isNaN(cu)) {
    valores.costo_total = String(c * cu)
  }
})

const reglas = {
  requerido: (v: string) => (v !== '' && v !== null && v !== undefined) || 'Campo requerido.',
  fechaNoFutura: (v: string) => !v || v <= hoy || 'La fecha no puede ser posterior a hoy.',
  odometroNoDecreciente: (v: string) => {
    if (ultimoOdometroActivo.value === null) return true
    return (
      Number(v) >= ultimoOdometroActivo.value ||
      `El odómetro no puede ser menor al de la última carga activa de este vehículo (${ultimoOdometroActivo.value}).`
    )
  }
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

  const payload: CargaValores = {
    vehiculo_id: valores.vehiculo_id,
    proveedor_id: valores.proveedor_id,
    producto_id: valores.producto_id,
    fecha: valores.fecha,
    odometro: Number(valores.odometro),
    cantidad: Number(valores.cantidad),
    costo_unitario: Number(valores.costo_unitario),
    costo_total: Number(valores.costo_total)
  }
  emit('enviar', payload, archivoSeleccionado.value)
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
