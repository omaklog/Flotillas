<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="4">
        <v-card class="pa-6 app-card-shadow" variant="flat">
          <h1 class="text-page-title mb-6">Iniciar sesión</h1>

          <v-form @submit.prevent="onSubmit">
            <v-text-field
              v-model="correo"
              label="Correo"
              type="email"
              autocomplete="username"
              required
            />
            <v-text-field
              v-model="contrasena"
              label="Contraseña"
              type="password"
              autocomplete="current-password"
              required
            />

            <div ref="turnstileEl" class="my-4"></div>

            <v-alert v-if="errorMsg" type="error" class="mb-4" data-testid="login-error">
              {{ errorMsg }}
            </v-alert>

            <v-btn
              type="submit"
              color="primary"
              block
              :loading="enviando"
              :disabled="!token"
              data-testid="submit-btn"
            >
              Entrar
            </v-btn>
          </v-form>

          <div class="mt-4 text-center">
            <NuxtLink to="/recuperar-password">¿Olvidaste tu contraseña?</NuxtLink>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'default' })

const correo = ref('')
const contrasena = ref('')
const enviando = ref(false)
const errorMsg = ref('')

const { token, render } = useTurnstile()
const turnstileEl = ref<HTMLElement>()

onMounted(() => {
  if (turnstileEl.value) render(turnstileEl.value)

  const route = useRoute()
  if (route.query.motivo === 'usuario_inactivo') {
    errorMsg.value = 'Tu cuenta ha sido desactivada. Contacta a tu administrador.'
  } else if (route.query.motivo === 'empresa_inactiva') {
    errorMsg.value = 'Esta empresa ha sido desactivada. Contacta a soporte.'
  }
})

const client = useSupabaseClient<Database>()
const { usuario } = useAuth()

// FR-014: mensaje genérico — no distingue "correo no existe" de "contraseña incorrecta"
// (protección contra enumeración de usuarios).
const MENSAJE_CREDENCIALES_INVALIDAS = 'Usuario o Contraseña Incorrecta'

async function onSubmit() {
  if (!token.value) return

  enviando.value = true
  errorMsg.value = ''

  try {
    const verificacion = await $fetch<{ valid: boolean }>('/api/auth/verify-captcha', {
      method: 'POST',
      body: { token: token.value }
    }).catch(() => ({ valid: false }))

    if (!verificacion.valid) {
      errorMsg.value = 'No se pudo verificar el captcha. Intenta de nuevo.'
      return
    }

    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
      email: correo.value,
      password: contrasena.value
    })

    if (signInError || !signInData.user) {
      errorMsg.value = MENSAJE_CREDENCIALES_INVALIDAS
      return
    }

    // No se usa `usuario` (useAuth) ni `cargarPerfil()` aquí a propósito: authUser
    // (useSupabaseUser()) se actualiza vía el listener `onAuthStateChange` del plugin de
    // @nuxtjs/supabase, que corre de forma asíncrona — justo después de que
    // `signInWithPassword()` resuelve, ese listener puede no haber corrido todavía, dejando
    // `usuario.value` en null aunque el login sí funcionó. Se consulta el perfil directo con
    // el `id` que ya devuelve la propia respuesta del login (objeto `User` clásico, sí tiene
    // `.id` — no es el JWT de `getClaims()`, ver la nota sobre `.sub` en `useAuth.ts`).
    const { data: perfil } = await client
      .from('usuarios')
      .select('*')
      .eq('auth_user_id', signInData.user.id)
      .single()

    if (!perfil) {
      errorMsg.value = MENSAJE_CREDENCIALES_INVALIDAS
      await client.auth.signOut()
      return
    }

    // Verificación post-login de activo/a (T039, FR-007) — antes de completar el login,
    // no solo en navegaciones posteriores (eso lo cubre app/middleware/auth.global.ts).
    if (!perfil.activo) {
      await client.auth.signOut()
      errorMsg.value = 'Tu cuenta ha sido desactivada. Contacta a tu administrador.'
      return
    }

    if (perfil.empresa_id) {
      const { data: empresa } = await client
        .from('empresas')
        .select('activo')
        .eq('id', perfil.empresa_id)
        .single()
      if (empresa && !empresa.activo) {
        await client.auth.signOut()
        errorMsg.value = 'Esta empresa ha sido desactivada. Contacta a soporte.'
        return
      }
    }

    usuario.value = perfil
    await navigateTo('/')
  } finally {
    enviando.value = false
  }
}
</script>
