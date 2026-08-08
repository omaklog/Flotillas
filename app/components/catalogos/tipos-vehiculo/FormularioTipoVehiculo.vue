<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-text-field v-model="valores.nombre" label="Nombre" :rules="[reglas.requerido]" required />

    <div class="d-flex align-end ga-2">
      <v-text-field
        v-model="valores.clave"
        label="Clave"
        :rules="[reglas.requerido, reglas.formatoClave, reglas.claveDuplicada]"
        required
        class="flex-grow-1"
      />
      <v-btn
        variant="outlined"
        class="mb-6"
        data-testid="autogenerar-clave-btn"
        @click="valores.clave = normalizarClave(valores.nombre)"
      >
        Autogenerar
      </v-btn>
    </div>

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
  registro?: Database['public']['Tables']['tipos_vehiculo']['Row']
  /** Claves ya usadas en la empresa (excluye la propia si se está editando). */
  clavesExistentes: string[]
}>()

const emit = defineEmits<{ guardado: [] }>()

const { usuario } = useAuth()
const catalogo = useCatalogo('tipos_vehiculo', {
  camposBusqueda: ['nombre'],
  ordenarPor: 'nombre',
  mensajeDependientes: 'No se puede eliminar: hay vehículos usando este tipo.'
})

const formRef = ref()
const enviando = ref(false)
const errorMsg = ref('')

const valores = reactive({
  clave: props.registro?.clave ?? '',
  nombre: props.registro?.nombre ?? ''
})

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido.',
  formatoClave: (v: string) =>
    /^[a-z0-9_]{1,50}$/.test(v) ||
    'Solo minúsculas, números y guion bajo, sin espacios (máx. 50 caracteres).',
  claveDuplicada: (v: string) =>
    !props.clavesExistentes.includes(v) || 'Ya existe un registro con esa clave.'
}

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  enviando.value = true
  errorMsg.value = ''
  try {
    if (props.registro) {
      await catalogo.editar(props.registro.id, { clave: valores.clave, nombre: valores.nombre })
    } else {
      await catalogo.crear({
        empresa_id: usuario.value!.empresa_id!,
        clave: valores.clave,
        nombre: valores.nombre
      })
    }
    emit('guardado')
  } catch {
    errorMsg.value = catalogo.error.value ?? 'No se pudo guardar el tipo de vehículo.'
  } finally {
    enviando.value = false
  }
}
</script>
