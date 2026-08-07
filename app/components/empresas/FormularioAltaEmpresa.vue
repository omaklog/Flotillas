<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <h2 class="text-section-title mb-4">Datos de la empresa</h2>

    <v-text-field
      v-model="empresa.nombre"
      label="Nombre de la empresa"
      :rules="[reglas.requerido]"
      required
    />
    <v-text-field v-model="empresa.rfc" label="RFC" :rules="[reglas.requerido]" required />
    <v-text-field v-model="empresa.telefono_oficina_1" label="Teléfono de oficina" />
    <v-text-field v-model="empresa.correo" label="Correo de la empresa" type="email" />
    <v-text-field v-model="empresa.pais" label="País" />
    <v-text-field v-model="empresa.moneda" label="Moneda (ISO 4217)" />
    <v-select
      v-model="empresa.unidad_distancia"
      :items="[
        { title: 'Kilómetros', value: 'km' },
        { title: 'Millas', value: 'millas' }
      ]"
      label="Unidad de distancia"
    />
    <v-select
      v-model="empresa.unidad_combustible"
      :items="[
        { title: 'Litros', value: 'litros' },
        { title: 'Galones', value: 'galones' }
      ]"
      label="Unidad de combustible"
    />

    <h2 class="text-section-title mt-6 mb-4">Primer administrador</h2>

    <v-text-field
      v-model="administrador.nombre"
      label="Nombre del administrador"
      :rules="[reglas.requerido]"
      required
    />
    <v-text-field
      v-model="administrador.correo"
      label="Correo del administrador"
      type="email"
      :rules="[reglas.requerido, reglas.correo]"
      required
    />

    <v-alert v-if="errorMsg" type="error" class="mt-4" data-testid="form-error">
      {{ errorMsg }}
    </v-alert>

    <v-btn type="submit" color="primary" class="mt-4" :loading="enviando" data-testid="submit-btn">
      Crear empresa
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  creada: [{ empresaId: string; usuarioId: string; nombreEmpresa: string }]
}>()

const formRef = ref()
const enviando = ref(false)
const errorMsg = ref('')

const empresa = reactive({
  nombre: '',
  rfc: '',
  telefono_oficina_1: '',
  correo: '',
  pais: 'México',
  moneda: 'MXN',
  unidad_distancia: 'km' as 'km' | 'millas',
  unidad_combustible: 'litros' as 'litros' | 'galones'
})

const administrador = reactive({
  nombre: '',
  correo: ''
})

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido',
  correo: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Correo inválido'
}

const MENSAJES_ERROR: Record<string, string> = {
  rfc_duplicado: 'Ya existe una empresa con ese RFC.',
  correo_en_uso: 'Ese correo ya está en uso por otro usuario.',
  validation_error: 'Revisa los campos del formulario.'
}

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  enviando.value = true
  errorMsg.value = ''
  try {
    const respuesta = await $fetch<{ empresa_id: string; usuario_id: string }>('/api/empresas', {
      method: 'POST',
      body: { empresa, administrador }
    })
    emit('creada', {
      empresaId: respuesta.empresa_id,
      usuarioId: respuesta.usuario_id,
      nombreEmpresa: empresa.nombre
    })
  } catch (err: unknown) {
    // `err.data` (ofetch) es el body completo de la respuesta, y Nitro anida el payload
    // propio de `createError({data})` bajo `data.data`, no en la raíz (`err.data.error` es el
    // flag booleano `error: true` de Nitro, no nuestro código) — confirmado contra una llamada
    // real al endpoint: `{ error: true, ..., data: { error: 'rfc_duplicado' } }`.
    const fetchError = err as { data?: { data?: { error?: string } } }
    const codigo = fetchError?.data?.data?.error
    errorMsg.value = (codigo && MENSAJES_ERROR[codigo]) || 'No se pudo crear la empresa.'
  } finally {
    enviando.value = false
  }
}
</script>
