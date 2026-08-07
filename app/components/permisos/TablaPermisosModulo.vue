<template>
  <v-card class="mb-4 app-card-shadow" variant="flat">
    <v-card-text>
      <div class="d-flex align-center justify-space-between mb-2">
        <h3 class="text-section-title">{{ moduloNombre }}</h3>
        <div class="d-flex align-center ga-2">
          <span class="text-body-main text-medium-emphasis">Todos</span>
          <v-checkbox
            :model-value="tieneTodos"
            density="compact"
            hide-details
            :data-testid="`permiso-${moduloClave}-todos`"
            @update:model-value="onToggleTodos"
          />
        </div>
      </div>
      <div class="d-flex flex-wrap ga-4">
        <v-checkbox
          v-for="accion in acciones"
          :key="accion.accion"
          :model-value="tieneTodos || seleccionadas.includes(accion.accion)"
          :disabled="tieneTodos"
          :label="accion.nombre"
          density="compact"
          hide-details
          :data-testid="`permiso-${moduloClave}-${accion.accion}`"
          @update:model-value="(marcado) => onToggleAccion(accion.accion, !!marcado)"
        />
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
interface AccionDisponible {
  accion: string
  nombre: string
}

const props = defineProps<{
  moduloClave: string
  moduloNombre: string
  acciones: AccionDisponible[]
  seleccionadas: string[] // acciones ya otorgadas para este módulo (incluye 'todos' si aplica)
}>()

const emit = defineEmits<{
  'update:seleccionadas': [string[]]
}>()

const tieneTodos = computed(() => props.seleccionadas.includes('todos'))

function onToggleTodos(marcado: boolean | null) {
  emit('update:seleccionadas', marcado ? ['todos'] : [])
}

function onToggleAccion(accion: string, marcado: boolean) {
  const sinTodos = props.seleccionadas.filter((a) => a !== 'todos')
  const siguiente = marcado ? [...sinTodos, accion] : sinTodos.filter((a) => a !== accion)
  emit('update:seleccionadas', siguiente)
}
</script>
