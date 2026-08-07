<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-text-field
      v-model="operario.nombre"
      label="Nombre del operario"
      :rules="[reglas.requerido]"
      required
    />
    <v-text-field
      v-model="operario.correo"
      label="Correo del operario"
      type="email"
      :rules="[reglas.requerido, reglas.correo]"
      required
    />

    <v-alert v-if="errorMsg" type="error" class="mt-4" data-testid="form-error">
      {{ errorMsg }}
    </v-alert>

    <v-btn type="submit" color="primary" class="mt-4" :loading="enviando" data-testid="submit-btn">
      Invitar operario
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  creado: [{ usuarioId: string; nombreOperario: string }]
}>()

const formRef = ref()
const enviando = ref(false)
const errorMsg = ref('')

const operario = reactive({
  nombre: '',
  correo: ''
})

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido',
  correo: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Correo inválido'
}

const MENSAJES_ERROR: Record<string, string> = {
  correo_en_uso: 'Ese correo ya está en uso por otro usuario.',
  validation_error: 'Revisa los campos del formulario.'
}

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  enviando.value = true
  errorMsg.value = ''
  try {
    const respuesta = await $fetch<{ usuario_id: string; pendiente: boolean }>('/api/usuarios', {
      method: 'POST',
      body: operario
    })
    emit('creado', { usuarioId: respuesta.usuario_id, nombreOperario: operario.nombre })
    operario.nombre = ''
    operario.correo = ''
    formRef.value.resetValidation()
  } catch (err: unknown) {
    // Ver la nota en FormularioAltaEmpresa.vue: Nitro anida el payload de
    // `createError({data})` bajo `data.data`, no en la raíz de `err.data`.
    const fetchError = err as { data?: { data?: { error?: string } } }
    const codigo = fetchError?.data?.data?.error
    errorMsg.value = (codigo && MENSAJES_ERROR[codigo]) || 'No se pudo invitar al operario.'
  } finally {
    enviando.value = false
  }
}
</script>
