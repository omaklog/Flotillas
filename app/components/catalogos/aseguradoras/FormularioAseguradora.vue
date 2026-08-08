<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-text-field
      v-model="valores.razon_social"
      label="Razón social"
      :rules="[reglas.requerido]"
      required
    />
    <v-text-field v-model="valores.rfc" label="RFC" :rules="[reglas.requerido]" required />

    <v-alert v-if="errorMsg" type="error" class="mt-2" data-testid="form-error">
      {{ errorMsg }}
    </v-alert>

    <v-btn type="submit" color="primary" class="mt-4" :loading="enviando" data-testid="submit-btn">
      Guardar
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

const props = defineProps<{
  registro?: Database['public']['Tables']['aseguradoras']['Row']
}>()

const emit = defineEmits<{ guardado: [] }>()

const { usuario } = useAuth()
const catalogo = useCatalogo('aseguradoras', {
  camposBusqueda: ['razon_social', 'rfc'],
  ordenarPor: 'razon_social',
  mensajeDependientes: 'No se puede eliminar: hay vehículos usando esta aseguradora.'
})

const formRef = ref()
const enviando = ref(false)
const errorMsg = ref('')

const valores = reactive({
  razon_social: props.registro?.razon_social ?? '',
  rfc: props.registro?.rfc ?? ''
})

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido.'
}

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  enviando.value = true
  errorMsg.value = ''
  try {
    if (props.registro) {
      await catalogo.editar(props.registro.id, {
        razon_social: valores.razon_social,
        rfc: valores.rfc
      })
    } else {
      await catalogo.crear({
        empresa_id: usuario.value!.empresa_id!,
        razon_social: valores.razon_social,
        rfc: valores.rfc
      })
    }
    emit('guardado')
  } catch {
    errorMsg.value = catalogo.error.value ?? 'No se pudo guardar la aseguradora.'
  } finally {
    enviando.value = false
  }
}
</script>
