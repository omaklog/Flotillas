<template>
  <div>
    <v-text-field
      :model-value="busqueda"
      :label="etiquetaBusqueda"
      prepend-inner-icon="mdi-magnify"
      clearable
      hide-details
      class="mb-4"
      :data-testid="`${testIdPrefix}-buscar`"
      @update:model-value="(valor) => emit('update:busqueda', valor ?? '')"
    />

    <v-skeleton-loader v-if="cargando" type="table" />

    <v-table v-else :data-testid="`${testIdPrefix}-tabla`">
      <thead>
        <tr>
          <slot name="encabezados" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in itemsPaginados" :key="item.id">
          <slot name="fila" :item="item" />
        </tr>
        <tr v-if="items.length === 0">
          <td :colspan="colspanVacio" class="text-center text-medium-emphasis">
            {{ mensajeVacio }}
          </td>
        </tr>
      </tbody>
    </v-table>

    <div
      v-if="!cargando && items.length > 0"
      class="d-flex align-center justify-space-between flex-wrap ga-2 mt-4"
    >
      <p class="text-metadata text-medium-emphasis" :data-testid="`${testIdPrefix}-resumen`">
        Mostrando {{ inicioRango }} a {{ finRango }} de {{ items.length }} registros
      </p>
      <v-pagination
        v-if="totalPaginas > 1"
        v-model="paginaActual"
        :length="totalPaginas"
        density="comfortable"
        total-visible="5"
        :data-testid="`${testIdPrefix}-paginacion`"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends { id: string }">
const ITEMS_POR_PAGINA = 20

const props = withDefaults(
  defineProps<{
    items: T[]
    cargando: boolean
    busqueda: string
    etiquetaBusqueda: string
    mensajeVacio: string
    colspanVacio?: number
    testIdPrefix: string
  }>(),
  { colspanVacio: 1 }
)

const emit = defineEmits<{ 'update:busqueda': [valor: string] }>()

defineSlots<{
  encabezados(): unknown
  fila(props: { item: T }): unknown
}>()

const paginaActual = ref(1)

watch(
  () => props.items,
  () => {
    paginaActual.value = 1
  }
)

const totalPaginas = computed(() => Math.ceil(props.items.length / ITEMS_POR_PAGINA))

const itemsPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * ITEMS_POR_PAGINA
  return props.items.slice(inicio, inicio + ITEMS_POR_PAGINA)
})

const inicioRango = computed(() =>
  props.items.length === 0 ? 0 : (paginaActual.value - 1) * ITEMS_POR_PAGINA + 1
)
const finRango = computed(() =>
  Math.min(paginaActual.value * ITEMS_POR_PAGINA, props.items.length)
)
</script>
