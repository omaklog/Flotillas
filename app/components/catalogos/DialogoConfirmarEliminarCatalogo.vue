<template>
  <v-dialog :model-value="modelValue" max-width="480" @update:model-value="onUpdateModelValue">
    <v-card class="app-modal-shadow" variant="flat">
      <v-card-title>Eliminar {{ etiquetaEntidad }}</v-card-title>
      <v-card-text>
        ¿Eliminar <strong>{{ nombre }}</strong>? Esta acción no se puede deshacer.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" data-testid="dialogo-eliminar-cancelar" @click="onCancelar">
          Cancelar
        </v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="eliminando"
          data-testid="dialogo-eliminar-confirmar"
          @click="emit('confirmar')"
        >
          Eliminar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  etiquetaEntidad: string
  nombre: string
  eliminando?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirmar: []
}>()

function onUpdateModelValue(valor: boolean) {
  emit('update:modelValue', valor)
}

function onCancelar() {
  emit('update:modelValue', false)
}
</script>
