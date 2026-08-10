<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <v-text-field v-model="valores.nombre" label="Nombre" :rules="[reglas.requerido]" required />
    <v-text-field v-model="valores.rfc" label="RFC" />
    <v-row>
      <v-col cols="12" sm="6">
        <v-text-field v-model="valores.calle" label="Calle" />
      </v-col>
      <v-col cols="12" sm="3">
        <v-text-field v-model="valores.numero" label="Número" />
      </v-col>
      <v-col cols="12" sm="3">
        <v-text-field v-model="valores.colonia" label="Colonia" />
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="12" sm="6">
        <v-text-field v-model="valores.telefono_oficina_1" label="Teléfono de oficina 1" />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field v-model="valores.telefono_oficina_2" label="Teléfono de oficina 2" />
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="12" sm="6">
        <v-text-field v-model="valores.celular" label="Celular" />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field v-model="valores.correo" label="Correo" />
      </v-col>
    </v-row>

    <v-alert v-if="errorMsg" type="error" class="mt-2" data-testid="form-error">
      {{ errorMsg }}
    </v-alert>

    <v-btn type="submit" color="primary" class="mt-4" :loading="enviando" data-testid="submit-btn">
      Guardar
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import type { ProveedorRow } from '~/composables/useProveedores'

const props = defineProps<{
  registro?: ProveedorRow
}>()

const emit = defineEmits<{ guardado: [] }>()

const { crear, editar, error: errorProveedores } = useProveedores()

const formRef = ref()
const enviando = ref(false)
const errorMsg = ref('')

const valores = reactive({
  nombre: props.registro?.nombre ?? '',
  rfc: props.registro?.rfc ?? '',
  calle: props.registro?.calle ?? '',
  numero: props.registro?.numero ?? '',
  colonia: props.registro?.colonia ?? '',
  telefono_oficina_1: props.registro?.telefono_oficina_1 ?? '',
  telefono_oficina_2: props.registro?.telefono_oficina_2 ?? '',
  celular: props.registro?.celular ?? '',
  correo: props.registro?.correo ?? ''
})

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido.'
}

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  const payload = {
    nombre: valores.nombre,
    rfc: valores.rfc || null,
    calle: valores.calle || null,
    numero: valores.numero || null,
    colonia: valores.colonia || null,
    telefono_oficina_1: valores.telefono_oficina_1 || null,
    telefono_oficina_2: valores.telefono_oficina_2 || null,
    celular: valores.celular || null,
    correo: valores.correo || null
  }

  enviando.value = true
  errorMsg.value = ''
  try {
    if (props.registro) {
      await editar(props.registro.id, payload)
    } else {
      await crear(payload)
    }
    emit('guardado')
  } catch {
    errorMsg.value = errorProveedores.value ?? 'No se pudo guardar el proveedor.'
  } finally {
    enviando.value = false
  }
}
</script>
