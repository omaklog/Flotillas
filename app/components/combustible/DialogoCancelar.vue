<template>
  <v-dialog :model-value="modelValue" max-width="480" @update:model-value="onUpdateModelValue">
    <v-card class="app-modal-shadow" variant="flat">
      <v-card-title>Cancelar carga de combustible</v-card-title>
      <v-card-text>
        <p class="text-body-main mb-4">
          Esta acción es permanente: la carga quedará cancelada y no podrá reactivarse ni
          editarse.
        </p>
        <v-textarea
          v-model="motivo"
          label="Motivo de la cancelación"
          :rules="[reglas.requerido, reglas.longitudMaxima]"
          maxlength="150"
          counter="150"
          rows="3"
          data-testid="dialogo-cancelar-motivo"
        />
        <v-alert v-if="errorExterno" type="error" class="mt-2" data-testid="dialogo-cancelar-error">
          {{ errorExterno }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" data-testid="dialogo-cancelar-cerrar" @click="onCancelar">
          Cerrar
        </v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="enviando"
          :disabled="!motivoValido"
          data-testid="dialogo-cancelar-confirmar"
          @click="onConfirmar"
        >
          Cancelar carga
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    enviando?: boolean
    errorExterno?: string | null
  }>(),
  { enviando: false, errorExterno: null }
)

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirmar: [motivo: string]
}>()

const motivo = ref('')

const reglas = {
  requerido: (v: string) => !!v.trim() || 'Captura un motivo.',
  longitudMaxima: (v: string) => v.length <= 150 || 'Máximo 150 caracteres.'
}

const motivoValido = computed(() => motivo.value.trim().length > 0 && motivo.value.length <= 150)

watch(
  () => props.modelValue,
  (abierto) => {
    if (abierto) motivo.value = ''
  }
)

function onUpdateModelValue(valor: boolean) {
  emit('update:modelValue', valor)
}

function onCancelar() {
  emit('update:modelValue', false)
}

function onConfirmar() {
  if (!motivoValido.value) return
  emit('confirmar', motivo.value.trim())
}
</script>
