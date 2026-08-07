<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="4">
        <v-card class="pa-6 app-card-shadow" variant="flat">
          <h1 class="text-page-title mb-6">Establecer contraseña</h1>

          <template v-if="enlaceInvalido">
            <v-alert type="error" data-testid="enlace-invalido">
              Este enlace no es válido o ya expiró. Solicita uno nuevo.
            </v-alert>
            <div class="mt-4 text-center">
              <NuxtLink to="/recuperar-password">Solicitar nuevo enlace</NuxtLink>
            </div>
          </template>

          <template v-else-if="actualizado">
            <v-alert type="success" data-testid="restablecer-confirmacion">
              Tu contraseña se actualizó correctamente.
            </v-alert>
            <div class="mt-4 text-center">
              <NuxtLink to="/login">Iniciar sesión</NuxtLink>
            </div>
          </template>

          <template v-else-if="listo">
            <v-form @submit.prevent="onSubmit">
              <v-text-field
                v-model="contrasena"
                label="Nueva contraseña"
                type="password"
                autocomplete="new-password"
                required
              />
              <v-text-field
                v-model="confirmacion"
                label="Confirmar contraseña"
                type="password"
                autocomplete="new-password"
                required
              />

              <v-alert v-if="errorMsg" type="error" class="mb-4" data-testid="restablecer-error">
                {{ errorMsg }}
              </v-alert>

              <v-btn
                type="submit"
                color="primary"
                block
                :loading="enviando"
                data-testid="submit-btn"
              >
                Guardar contraseña
              </v-btn>
            </v-form>
          </template>

          <template v-else>
            <div class="text-center py-8">
              <v-progress-circular indeterminate color="primary" />
            </div>
          </template>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })

// Mínimo real configurado en supabase/config.toml (`minimum_password_length`), no un valor
// arbitrario del frontend — debe coincidir con lo que GoTrue realmente exige.
const LONGITUD_MINIMA = 6

const client = useSupabaseClient()

const listo = ref(false)
const enlaceInvalido = ref(false)
const actualizado = ref(false)
const enviando = ref(false)
const errorMsg = ref('')
const contrasena = ref('')
const confirmacion = ref('')

onMounted(async () => {
  // `admin.generateLink()` (invitaciones y recuperación) SIEMPRE genera enlaces de flujo
  // implícito clásico (tokens en el hash de la URL: `#access_token=...&refresh_token=...`) —
  // la API de administración no tiene forma de generar un enlace PKCE, porque PKCE requiere un
  // `code_verifier` que solo puede existir en el navegador que inició el flujo, y aquí el
  // enlace lo genera el servidor.
  //
  // Pero `createBrowserClient` de @supabase/ssr fuerza `flowType: 'pkce'` de forma hardcodeada
  // (no es configurable vía opciones) — así que `detectSessionInUrl`/`getSession()` detecta el
  // mismatch de flujo y descarta el hash en silencio (`AuthPKCEGrantCodeExchangeError: "Not a
  // valid PKCE flow url."`, atrapado internamente y solo mandado a debug-log, nunca propagado
  // como error visible — confirmado leyendo GoTrueClient._getSessionFromURL). Por eso ni
  // `onAuthStateChange` ni `getSession()` ven nunca la sesión del enlace.
  //
  // Fix: parsear el hash a mano y establecer la sesión directo con `setSession`, que no pasa
  // por esa validación de flowType.
  const hashParams = new URLSearchParams(window.location.hash.slice(1))
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')

  if (accessToken && refreshToken) {
    const { error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    })
    // Limpia los tokens de la URL visible (barra de direcciones, historial) una vez usados.
    window.history.replaceState(null, '', window.location.pathname)
    if (!error) {
      listo.value = true
      return
    }
  }

  const { data: sessionData } = await client.auth.getSession()
  if (sessionData.session) {
    listo.value = true
  } else {
    enlaceInvalido.value = true
  }
})

async function onSubmit() {
  errorMsg.value = ''

  if (contrasena.value !== confirmacion.value) {
    errorMsg.value = 'Las contraseñas no coinciden.'
    return
  }
  if (contrasena.value.length < LONGITUD_MINIMA) {
    errorMsg.value = `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`
    return
  }

  enviando.value = true
  try {
    const { error } = await client.auth.updateUser({ password: contrasena.value })
    if (error) {
      errorMsg.value = 'No se pudo actualizar la contraseña. Intenta de nuevo.'
      return
    }
    actualizado.value = true
  } finally {
    enviando.value = false
  }
}
</script>
