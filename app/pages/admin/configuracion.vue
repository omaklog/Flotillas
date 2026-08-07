<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Configuración de la Empresa</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Gestiona los detalles corporativos y preferencias regionales.
        </p>
      </div>
      <v-btn
        v-if="!cargando"
        color="primary-container"
        prepend-icon="mdi-content-save-outline"
        :loading="enviando"
        data-testid="submit-btn"
        @click="onSubmit"
      >
        Guardar cambios
      </v-btn>
    </div>

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-form v-else ref="formRef" @submit.prevent="onSubmit">
      <v-row>
        <!-- Identidad Visual (docs/design-references/screens/configuracion-empresa.png) -->
        <v-col cols="12" md="4">
          <v-card class="app-card-shadow" variant="flat">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-palette-swatch-outline" color="primary" class="mr-2" />
                Identidad Visual
              </h2>

              <div
                class="logo-dropzone mb-4"
                role="button"
                tabindex="0"
                aria-label="Subir logo de la empresa"
                data-testid="logo-dropzone"
                @click="triggerFileInput"
                @keydown.enter="triggerFileInput"
                @keydown.space.prevent="triggerFileInput"
                @dragover.prevent
                @drop.prevent="onDrop"
              >
                <v-img
                  v-if="logoPreview"
                  :src="logoPreview"
                  alt="Logo de la empresa"
                  class="logo-dropzone__preview"
                  width="120"
                  height="96"
                />
                <v-icon v-else icon="mdi-domain" size="40" color="grey" />
                <p class="text-metadata text-medium-emphasis text-center mt-2">
                  Arrastra tu logo aquí o
                  <span class="text-secondary font-weight-medium">explora</span>
                </p>
                <p class="text-label-caps text-medium-emphasis mt-2">PNG, JPG, SVG (máx. 2 MB)</p>
                <input
                  ref="inputFileRef"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  class="d-none"
                  data-testid="logo-input"
                  @change="onFileInputChange"
                />
              </div>
              <v-messages v-if="errorLogo" :messages="[errorLogo]" color="error" active />

              <v-text-field
                v-model="form.nombre"
                label="Nombre de la empresa"
                :rules="[reglas.requerido]"
                required
              />
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="8">
          <v-card class="app-card-shadow mb-4" variant="flat">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-card-account-details-outline" color="primary" class="mr-2" />
                Información de Contacto y Legal
              </h2>

              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="form.rfc"
                    label="RFC"
                    :rules="[reglas.requerido]"
                    required
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="form.correo"
                    label="Correo de la empresa"
                    type="email"
                    :rules="[reglas.correo]"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="form.telefono_oficina_1" label="Teléfono de oficina 1" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="form.telefono_oficina_2" label="Teléfono de oficina 2" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="form.telefono_movil" label="Teléfono móvil" />
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-card class="app-card-shadow" variant="flat">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-earth" color="primary" class="mr-2" />
                Preferencias Regionales
              </h2>

              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field v-model="form.pais" label="País" />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field v-model="form.moneda" label="Moneda (ISO 4217)" />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="form.unidad_distancia"
                    :items="[
                      { title: 'Kilómetros (km)', value: 'km' },
                      { title: 'Millas (mi)', value: 'millas' }
                    ]"
                    label="Unidad de distancia"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="form.unidad_combustible"
                    :items="[
                      { title: 'Litros (L)', value: 'litros' },
                      { title: 'Galones (gal)', value: 'galones' }
                    ]"
                    label="Unidad de combustible"
                  />
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-alert v-if="errorMsg" type="error" class="mt-4" data-testid="config-error">
        {{ errorMsg }}
      </v-alert>
      <v-alert v-if="guardadoOk" type="success" class="mt-4" data-testid="config-guardada">
        Configuración guardada.
      </v-alert>
    </v-form>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type Empresa = Database['public']['Tables']['empresas']['Row']

const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024 // 2 MiB — igual al file_size_limit del bucket.
const TIPOS_LOGO_ACEPTADOS = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']

const { usuario } = useAuth()
const client = useSupabaseClient<Database>()

const cargando = ref(true)
const enviando = ref(false)
const errorMsg = ref('')
const errorLogo = ref('')
const guardadoOk = ref(false)
const formRef = ref()
const inputFileRef = ref<HTMLInputElement>()
const logoArchivo = ref<File | null>(null)
const logoPreview = ref<string | null>(null)

const form = reactive({
  nombre: '',
  rfc: '',
  telefono_oficina_1: '' as string | null,
  telefono_oficina_2: '' as string | null,
  telefono_movil: '' as string | null,
  correo: '' as string | null,
  pais: '',
  moneda: '',
  unidad_distancia: 'km' as Database['public']['Enums']['unidad_distancia'],
  unidad_combustible: 'litros' as Database['public']['Enums']['unidad_combustible']
})

const reglas = {
  requerido: (v: string) => !!v || 'Campo requerido',
  correo: (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Correo inválido'
}

const MENSAJES_ERROR: Record<string, string> = {
  rfc_duplicado: 'Ya existe otra empresa con ese RFC.',
  validation_error: 'Revisa los campos del formulario.'
}

function cargarDesdeEmpresa(empresa: Empresa) {
  form.nombre = empresa.nombre
  form.rfc = empresa.rfc
  form.telefono_oficina_1 = empresa.telefono_oficina_1
  form.telefono_oficina_2 = empresa.telefono_oficina_2
  form.telefono_movil = empresa.telefono_movil
  form.correo = empresa.correo
  form.pais = empresa.pais
  form.moneda = empresa.moneda
  form.unidad_distancia = empresa.unidad_distancia
  form.unidad_combustible = empresa.unidad_combustible
  logoPreview.value = empresa.logo_url
}

onMounted(async () => {
  const empresaId = usuario.value?.empresa_id
  if (!empresaId) {
    errorMsg.value = 'Tu cuenta no tiene una empresa asociada.'
    cargando.value = false
    return
  }
  const { data, error } = await client.from('empresas').select('*').eq('id', empresaId).single()
  if (error || !data) {
    errorMsg.value = 'No se pudo cargar la configuración de la empresa.'
  } else {
    cargarDesdeEmpresa(data)
  }
  cargando.value = false
})

function triggerFileInput() {
  inputFileRef.value?.click()
}

function elegirArchivo(archivo: File | undefined | null) {
  errorLogo.value = ''
  if (!archivo) return

  if (!TIPOS_LOGO_ACEPTADOS.includes(archivo.type)) {
    errorLogo.value = 'El logo debe ser PNG, JPG, SVG o WEBP.'
    return
  }
  if (archivo.size > TAMANO_MAXIMO_LOGO) {
    errorLogo.value = 'El logo no debe superar 2 MB.'
    return
  }

  logoArchivo.value = archivo
  logoPreview.value = URL.createObjectURL(archivo)
}

function onFileInputChange(event: Event) {
  const archivo = (event.target as HTMLInputElement).files?.[0]
  elegirArchivo(archivo)
}

function onDrop(event: DragEvent) {
  const archivo = event.dataTransfer?.files?.[0]
  elegirArchivo(archivo)
}

async function subirLogo(empresaId: string): Promise<string | null> {
  const archivo = logoArchivo.value
  if (!archivo) return null

  // Ruta `<empresa_id>/logo.<ext>` — las políticas RLS de `storage.objects` (migración
  // 20260807010000) verifican justo ese primer segmento contra `private.empresa_id()`.
  const extension = archivo.name.split('.').pop() || 'png'
  const ruta = `${empresaId}/logo.${extension}`
  const { error } = await client.storage
    .from('logos-empresas')
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type })
  if (error) throw error

  const { data } = client.storage.from('logos-empresas').getPublicUrl(ruta)
  return data.publicUrl
}

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  const empresaId = usuario.value?.empresa_id
  if (!empresaId) return

  enviando.value = true
  errorMsg.value = ''
  guardadoOk.value = false
  try {
    const logoUrl = await subirLogo(empresaId)

    await $fetch(`/api/empresas/${empresaId}`, {
      method: 'PATCH',
      body: {
        ...form,
        ...(logoUrl ? { logo_url: logoUrl } : {})
      }
    })
    guardadoOk.value = true
  } catch (err: unknown) {
    // Ver la nota equivalente en FormularioAltaEmpresa.vue: `err.data` es el body completo,
    // y Nitro anida el payload de `createError({data})` bajo `data.data`, no en la raíz.
    const fetchError = err as { data?: { data?: { error?: string } } }
    const codigo = fetchError?.data?.data?.error
    errorMsg.value = (codigo && MENSAJES_ERROR[codigo]) || 'No se pudo guardar la configuración.'
  } finally {
    enviando.value = false
  }
}
</script>
