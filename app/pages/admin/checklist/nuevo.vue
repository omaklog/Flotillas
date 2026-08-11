<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Nuevo checklist</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Revisión de seguridad de un vehículo antes de su salida.
        </p>
      </div>
    </div>

    <v-alert v-if="checklistCreadoId" type="warning" class="mb-4" data-testid="reintentar-items-alert">
      El checklist se creó, pero sus ítems no se guardaron ({{ errorItems }}).
      <div class="mt-2">
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          :loading="reintentando"
          data-testid="reintentar-items-btn"
          @click="onReintentarItems"
        >
          Reintentar ítems
        </v-btn>
      </div>
    </v-alert>

    <ChecklistFormularioChecklist :enviando="enviando" :error-externo="errorMsg" @enviar="onEnviar" />
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ItemRespuesta } from '~/composables/useChecklists'

definePageMeta({ layout: 'admin' })

type ChecklistValores = Omit<
  Database['public']['Tables']['checklists']['Insert'],
  'empresa_id' | 'responsable_id'
>

const { crear, reintentarItems, error: errorChecklists } = useChecklists()

const enviando = ref(false)
const reintentando = ref(false)
const errorMsg = ref<string | null>(null)
const errorItems = ref<string | null>(null)
const checklistCreadoId = ref<string | null>(null)
let itemsPendientes: ItemRespuesta[] = []

async function onEnviar(valores: ChecklistValores, items: ItemRespuesta[]) {
  enviando.value = true
  errorMsg.value = null
  errorItems.value = null

  const resultado = await (async () => {
    try {
      return await crear(valores, items)
    } catch {
      errorMsg.value = errorChecklists.value ?? 'No se pudo crear el checklist.'
      return null
    }
  })()

  if (!resultado) {
    enviando.value = false
    return
  }

  if (resultado.itemsFallaron) {
    checklistCreadoId.value = resultado.checklistId
    errorItems.value = errorChecklists.value ?? 'No se pudieron guardar los ítems.'
    itemsPendientes = items
    enviando.value = false
    return
  }

  enviando.value = false
  await navigateTo(`/admin/checklist/${resultado.checklistId}`)
}

async function onReintentarItems() {
  if (!checklistCreadoId.value) return
  reintentando.value = true
  try {
    await reintentarItems(checklistCreadoId.value, itemsPendientes)
    await navigateTo(`/admin/checklist/${checklistCreadoId.value}`)
  } catch {
    errorItems.value = errorChecklists.value ?? 'No se pudieron guardar los ítems.'
  } finally {
    reintentando.value = false
  }
}
</script>
