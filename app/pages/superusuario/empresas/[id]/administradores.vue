<template>
  <div>
    <h1 class="text-page-title mb-2">Administradores</h1>
    <p v-if="empresa" class="text-body-main mb-6">{{ empresa.nombre }} — RFC {{ empresa.rfc }}</p>

    <v-skeleton-loader v-if="cargando" type="article" />

    <template v-else-if="!empresa">
      <v-alert type="error" data-testid="empresa-no-encontrada"
        >No se encontró esa empresa.</v-alert
      >
    </template>

    <template v-else>
      <v-expansion-panels class="mb-6">
        <v-expansion-panel title="Invitar administrador">
          <v-expansion-panel-text>
            <v-form ref="formRef" @submit.prevent="onInvitar">
              <v-text-field
                v-model="nuevo.nombre"
                label="Nombre del administrador"
                :rules="[reglas.requerido]"
                required
              />
              <v-text-field
                v-model="nuevo.correo"
                label="Correo del administrador"
                type="email"
                :rules="[reglas.requerido, reglas.correo]"
                required
              />

              <v-alert v-if="errorInvitar" type="error" class="mb-4" data-testid="invitar-error">
                {{ errorInvitar }}
              </v-alert>

              <v-btn type="submit" color="primary" :loading="invitando" data-testid="submit-btn">
                Invitar
              </v-btn>
            </v-form>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <v-alert v-if="errorEstado" type="error" class="mb-4" data-testid="estado-error">
        {{ errorEstado }}
      </v-alert>

      <v-table data-testid="tabla-administradores">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="admin in administradores" :key="admin.id">
            <td>{{ admin.nombre }}</td>
            <td>{{ admin.correo }}</td>
            <td>
              <v-chip
                :color="admin.activo ? 'success' : 'default'"
                size="small"
                :data-testid="`estado-${admin.id}`"
              >
                {{ admin.activo ? 'Activo' : 'Revocado' }}
              </v-chip>
            </td>
            <td>
              <v-btn
                size="small"
                variant="outlined"
                :loading="cambiandoEstado === admin.id"
                :data-testid="`${admin.activo ? 'revocar' : 'reactivar'}-${admin.id}`"
                @click="onCambiarEstado(admin)"
              >
                {{ admin.activo ? 'Revocar' : 'Reactivar' }}
              </v-btn>
            </td>
          </tr>
          <tr v-if="administradores.length === 0">
            <td colspan="4" class="text-center text-medium-emphasis">Sin administradores.</td>
          </tr>
        </tbody>
      </v-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'superusuario' })

type Empresa = Database['public']['Tables']['empresas']['Row']
type Administrador = Database['public']['Tables']['usuarios']['Row']

const route = useRoute()
const empresaId = route.params.id as string

const client = useSupabaseClient<Database>()

const cargando = ref(true)
const empresa = ref<Empresa | null>(null)
const administradores = ref<Administrador[]>([])

const formRef = ref()
const invitando = ref(false)
const errorInvitar = ref('')
const nuevo = reactive({ nombre: '', correo: '' })

const cambiandoEstado = ref<string | null>(null)
const errorEstado = ref('')

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido',
  correo: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Correo inválido'
}

const MENSAJES_ERROR_INVITAR: Record<string, string> = {
  correo_en_uso: 'Ese correo ya está en uso por otro usuario.',
  validation_error: 'Revisa los campos del formulario.'
}

const MENSAJES_ERROR_ESTADO: Record<string, string> = {
  ultimo_administrador: 'No puedes revocar al último administrador activo de la empresa.'
}

async function cargar() {
  cargando.value = true
  const [{ data: empresaData }, { data: administradoresData }] = await Promise.all([
    client.from('empresas').select('*').eq('id', empresaId).maybeSingle(),
    client
      .from('usuarios')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('rol', 'admin')
      .order('created_at')
  ])
  empresa.value = empresaData ?? null
  administradores.value = administradoresData ?? []
  cargando.value = false
}

async function onInvitar() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  invitando.value = true
  errorInvitar.value = ''
  try {
    await $fetch(`/api/empresas/${empresaId}/administradores`, {
      method: 'POST',
      body: nuevo
    })
    nuevo.nombre = ''
    nuevo.correo = ''
    formRef.value.resetValidation()
    await cargar()
  } catch (err: unknown) {
    const fetchError = err as { data?: { data?: { error?: string } } }
    const codigo = fetchError?.data?.data?.error
    errorInvitar.value = (codigo && MENSAJES_ERROR_INVITAR[codigo]) || 'No se pudo invitar.'
  } finally {
    invitando.value = false
  }
}

async function onCambiarEstado(admin: Administrador) {
  cambiandoEstado.value = admin.id
  errorEstado.value = ''
  try {
    await $fetch(`/api/usuarios/${admin.id}/estado`, {
      method: 'PATCH',
      body: { activo: !admin.activo }
    })
    await cargar()
  } catch (err: unknown) {
    const fetchError = err as { data?: { data?: { error?: string } } }
    const codigo = fetchError?.data?.data?.error
    errorEstado.value =
      (codigo && MENSAJES_ERROR_ESTADO[codigo]) || 'No se pudo cambiar el estado del administrador.'
  } finally {
    cambiandoEstado.value = null
  }
}

onMounted(cargar)
</script>
