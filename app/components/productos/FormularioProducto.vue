<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-text-field v-model="valores.nombre" label="Nombre" :rules="[reglas.requerido]" required />

    <div v-if="tipoBloqueado" class="d-flex align-center ga-1">
      <v-autocomplete
        v-model="valores.tipo"
        label="Tipo"
        :items="TIPOS_PRODUCTO"
        :rules="[reglas.requerido]"
        disabled
        required
        data-testid="tipo-select"
      />
      <v-tooltip text="No se puede cambiar el tipo: ya tiene registros asociados.">
        <template #activator="{ props: tooltipProps }">
          <v-icon
            v-bind="tooltipProps"
            icon="mdi-information-outline"
            size="20"
            class="mb-6"
            data-testid="tipo-bloqueado-info"
          />
        </template>
      </v-tooltip>
    </div>
    <!-- v-autocomplete, no v-select: mismo criterio que el resto del proyecto — el click de
    Playwright sobre el combobox de un v-select choca con un overlay interno que intercepta el
    evento. -->
    <v-autocomplete
      v-else
      v-model="valores.tipo"
      label="Tipo"
      :items="TIPOS_PRODUCTO"
      :rules="[reglas.requerido]"
      required
      data-testid="tipo-select"
    />

    <v-text-field v-model="valores.unidad" label="Unidad" placeholder="ej. litro, pieza, servicio" />

    <v-alert v-if="errorMsg" type="error" class="mt-2" data-testid="form-error">
      {{ errorMsg }}
    </v-alert>

    <v-btn type="submit" color="primary" class="mt-4" :loading="enviando" data-testid="submit-btn">
      Guardar
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import type { ProductoRow } from '~/composables/useProductos'

const props = defineProps<{
  registro?: ProductoRow
}>()

const emit = defineEmits<{ guardado: [] }>()

const { crear, editar, tieneRegistrosAsociados, error: errorProductos } = useProductos()

const TIPOS_PRODUCTO = [
  { title: 'Refacción', value: 'refaccion' },
  { title: 'Combustible', value: 'combustible' },
  { title: 'Servicio', value: 'servicio' },
  { title: 'Llanta', value: 'llanta' },
  { title: 'Consumible', value: 'consumible' }
]

const formRef = ref()
const enviando = ref(false)
const errorMsg = ref('')
const tipoBloqueado = ref(false)

const valores = reactive({
  nombre: props.registro?.nombre ?? '',
  tipo: props.registro?.tipo ?? ('' as ProductoRow['tipo'] | ''),
  unidad: props.registro?.unidad ?? ''
})

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido.'
}

onMounted(async () => {
  if (props.registro) {
    tipoBloqueado.value = await tieneRegistrosAsociados(props.registro.id)
  }
})

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  const payload = {
    nombre: valores.nombre,
    tipo: valores.tipo as ProductoRow['tipo'],
    unidad: valores.unidad || null
  }

  enviando.value = true
  errorMsg.value = ''
  try {
    if (props.registro) {
      // Si el tipo está bloqueado, no se incluye en el payload aunque el usuario no pueda
      // tocarlo de todas formas (contracts/productos.md).
      const { tipo: _tipo, ...resto } = payload
      await editar(props.registro.id, tipoBloqueado.value ? resto : payload)
    } else {
      await crear(payload)
    }
    emit('guardado')
  } catch {
    errorMsg.value = errorProductos.value ?? 'No se pudo guardar el producto.'
  } finally {
    enviando.value = false
  }
}
</script>
