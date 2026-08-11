<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-text-field
      v-model="valores.nombre_item"
      label="Nombre del ítem"
      :rules="[reglas.requerido]"
      required
    />
    <v-text-field v-model="valores.orden" label="Orden" type="number" :rules="[reglas.requerido]" required />
    <v-checkbox v-model="valores.es_critico" label="Es crítico" hide-details class="mb-2" />

    <v-alert v-if="errorMsg" type="error" class="mt-2" data-testid="form-error">
      {{ errorMsg }}
    </v-alert>

    <v-btn type="submit" color="primary" class="mt-4" :loading="enviando" data-testid="submit-btn">
      Guardar
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import type { ItemPlantillaRow } from '~/composables/useChecklistPlantillas'

const props = defineProps<{
  registro?: ItemPlantillaRow
  tipoVehiculoId: string
}>()

const emit = defineEmits<{ guardado: [] }>()

const { crear, editar, error: errorPlantillas } = useChecklistPlantillas()

const formRef = ref()
const enviando = ref(false)
const errorMsg = ref('')

const valores = reactive({
  nombre_item: props.registro?.nombre_item ?? '',
  orden: (props.registro?.orden ?? 0) as number | string,
  es_critico: props.registro?.es_critico ?? false
})

const reglas = {
  requerido: (v: string | number) => v !== '' && v !== null && v !== undefined || 'Campo requerido.'
}

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  enviando.value = true
  errorMsg.value = ''
  try {
    const payload = {
      nombre_item: valores.nombre_item,
      orden: Number(valores.orden),
      es_critico: valores.es_critico
    }
    if (props.registro) {
      await editar(props.registro.id, payload)
    } else {
      await crear({ ...payload, tipo_vehiculo_id: props.tipoVehiculoId })
    }
    emit('guardado')
  } catch {
    errorMsg.value = errorPlantillas.value ?? 'No se pudo guardar el ítem de plantilla.'
  } finally {
    enviando.value = false
  }
}
</script>
