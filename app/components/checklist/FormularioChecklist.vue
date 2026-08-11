<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-clipboard-check-outline" color="primary" class="mr-2" />
          Datos del checklist
        </h2>

        <v-row>
          <v-col cols="12" md="6">
            <v-autocomplete
              v-model="vehiculoId"
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
              v-model="conductorId"
              label="Conductor"
              :items="conductoresOpciones"
              item-title="label"
              item-value="id"
              clearable
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="resultado"
              label="Resultado"
              :items="[
                { title: 'Aprobado', value: 'aprobado' },
                { title: 'Con observaciones', value: 'con_observaciones' }
              ]"
              :rules="[reglas.requerido]"
              required
              data-testid="resultado-select"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card v-if="vehiculoId" class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
          <v-icon icon="mdi-format-list-checks" color="primary" class="mr-2" />
          Ítems a revisar
        </h2>

        <v-alert v-if="!cargandoPlantilla && lineas.length === 0" type="warning" density="compact" data-testid="sin-plantilla">
          Esta empresa no tiene ningún ítem de plantilla configurado para el tipo de vehículo
          seleccionado. Configúralos primero en "Checklist" → "Plantilla".
        </v-alert>

        <div v-for="(linea, index) in lineas" :key="linea.plantillaItemId" class="mb-4" :data-testid="`item-${index}`">
          <div class="d-flex align-center justify-space-between ga-4 flex-wrap">
            <div class="d-flex align-center ga-2">
              <span class="text-body-main">{{ linea.nombreItem }}</span>
              <v-chip v-if="linea.esCritico" color="warning" size="small">Crítico</v-chip>
            </div>
            <v-btn-toggle v-model="linea.cumple" mandatory density="compact" :data-testid="`item-${index}-cumple`">
              <v-btn :value="true" size="small">Cumple</v-btn>
              <v-btn :value="false" size="small">No cumple</v-btn>
            </v-btn-toggle>
          </div>
          <v-textarea
            v-if="!linea.cumple"
            v-model="linea.observaciones"
            :label="`Observaciones de ${linea.nombreItem}`"
            rows="2"
            :rules="[reglas.requerido]"
            required
            class="mt-2"
          />
        </div>
      </v-card-text>
    </v-card>

    <v-alert v-if="errorExterno" type="error" class="mb-4" data-testid="form-error">
      {{ errorExterno }}
    </v-alert>

    <v-btn
      type="submit"
      color="primary"
      :loading="enviando"
      :disabled="!vehiculoId || lineas.length === 0"
      data-testid="submit-btn"
    >
      Guardar
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ItemRespuesta } from '~/composables/useChecklists'

type ChecklistValores = Omit<
  Database['public']['Tables']['checklists']['Insert'],
  'empresa_id' | 'responsable_id'
>

withDefaults(
  defineProps<{
    enviando?: boolean
    errorExterno?: string | null
  }>(),
  { enviando: false, errorExterno: null }
)

const emit = defineEmits<{
  enviar: [valores: ChecklistValores, items: ItemRespuesta[]]
}>()

const { listar: listarVehiculos, registros: vehiculos } = useVehiculos()
const { listar: listarConductores, registros: conductores } = useConductores()
const { listar: listarPlantilla, registros: itemsPlantilla } = useChecklistPlantillas()
const client = useSupabaseClient<Database>()

onMounted(async () => {
  await Promise.all([listarVehiculos(), listarConductores()])
})

const vehiculosOpciones = computed(() =>
  vehiculos.value.map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo} — ${v.placa}` }))
)
const conductoresOpciones = computed(() =>
  conductores.value.map((c) => ({ id: c.id, label: `${c.nombre} ${c.apellidos}` }))
)

const vehiculoId = ref('')
const conductorId = ref<string | null>(null)
const resultado = ref<Database['public']['Enums']['resultado_checklist'] | ''>('')

type Linea = {
  plantillaItemId: string
  nombreItem: string
  esCritico: boolean
  cumple: boolean
  observaciones: string
}

const lineas = ref<Linea[]>([])
const cargandoPlantilla = ref(false)

watch(vehiculoId, async (id) => {
  lineas.value = []
  conductorId.value = null
  if (!id) return

  const vehiculo = vehiculos.value.find((v) => v.id === id)
  if (!vehiculo) return

  cargandoPlantilla.value = true
  await listarPlantilla(vehiculo.tipo_vehiculo_id)
  cargandoPlantilla.value = false

  lineas.value = itemsPlantilla.value.map((item) => ({
    plantillaItemId: item.id,
    nombreItem: item.nombre_item,
    esCritico: item.es_critico,
    cumple: true,
    observaciones: ''
  }))

  const { data: asignacion } = await client
    .from('asignaciones_conductor_vehiculo')
    .select('conductor_id')
    .eq('vehiculo_id', id)
    .is('fecha_fin', null)
    .maybeSingle()
  conductorId.value = asignacion?.conductor_id ?? null
})

const reglas = {
  requerido: (v: string | boolean) => (v !== '' && v !== null && v !== undefined) || 'Campo requerido.'
}

const formRef = ref()

async function onSubmit() {
  if (lineas.value.length === 0) return
  const { valid } = await formRef.value.validate()
  if (!valid) return

  const payload: ChecklistValores = {
    vehiculo_id: vehiculoId.value,
    tipo_vehiculo_id: vehiculos.value.find((v) => v.id === vehiculoId.value)!.tipo_vehiculo_id,
    conductor_id: conductorId.value,
    resultado: resultado.value as Database['public']['Enums']['resultado_checklist']
  }
  const itemsPayload: ItemRespuesta[] = lineas.value.map((l) => ({
    nombre_item: l.nombreItem,
    cumple: l.cumple,
    observaciones: l.cumple ? null : l.observaciones,
    es_critico: l.esCritico,
    plantilla_item_id: l.plantillaItemId
  }))

  emit('enviar', payload, itemsPayload)
}
</script>
