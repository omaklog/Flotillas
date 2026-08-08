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

    <v-select
      v-model="valores.tipo"
      label="Tipo"
      :items="OPCIONES_TIPO"
      :rules="[reglas.requerido]"
      required
    />

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

const OPCIONES_TIPO = [
  { title: 'Estatal', value: 'estatal' },
  { title: 'Federal', value: 'federal' }
]

const props = defineProps<{
  registro?: Database['public']['Tables']['permisos']['Row']
  /** Claves ya usadas en la empresa (excluye la propia si se está editando). */
  clavesExistentes: string[]
}>()

const emit = defineEmits<{ guardado: [] }>()

const { usuario } = useAuth()
const catalogo = useCatalogo('permisos', {
  camposBusqueda: ['nombre', 'clave'],
  ordenarPor: 'nombre',
  mensajeDependientes: 'No se puede eliminar: hay vehículos con este permiso asignado.'
})

const formRef = ref()
const enviando = ref(false)
const errorMsg = ref('')

const valores = reactive({
  clave: props.registro?.clave ?? '',
  nombre: props.registro?.nombre ?? '',
  tipo: props.registro?.tipo ?? null
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
      await catalogo.editar(props.registro.id, {
        clave: valores.clave,
        nombre: valores.nombre,
        tipo: valores.tipo!
      })
    } else {
      await catalogo.crear({
        empresa_id: usuario.value!.empresa_id!,
        clave: valores.clave,
        nombre: valores.nombre,
        tipo: valores.tipo!
      })
    }
    emit('guardado')
  } catch {
    errorMsg.value = catalogo.error.value ?? 'No se pudo guardar el permiso.'
  } finally {
    enviando.value = false
  }
}
</script>
