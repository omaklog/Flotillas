<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="4">
        <v-card class="pa-6 app-card-shadow" variant="flat">
          <h1 class="text-page-title mb-6">Recuperar contraseña</h1>

          <template v-if="!enviado">
            <v-form @submit.prevent="onSubmit">
              <v-text-field
                v-model="correo"
                label="Correo"
                type="email"
                autocomplete="username"
                required
              />

              <v-btn
                type="submit"
                color="primary"
                block
                :loading="enviando"
                data-testid="submit-btn"
              >
                Enviar enlace
              </v-btn>
            </v-form>
          </template>

          <v-alert v-else type="success" data-testid="recuperar-confirmacion">
            Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.
          </v-alert>

          <div class="mt-4 text-center">
            <NuxtLink to="/login">Volver a iniciar sesión</NuxtLink>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })

const correo = ref('')
const enviando = ref(false)
const enviado = ref(false)

const client = useSupabaseClient()

async function onSubmit() {
  enviando.value = true

  try {
    // FR-017: no se distingue el resultado real de `resetPasswordForEmail` — se ignora el
    // error deliberadamente (p. ej. correo inexistente) y siempre se muestra la misma
    // confirmación, para no revelar si una cuenta existe.
    await client.auth
      .resetPasswordForEmail(correo.value, {
        redirectTo: `${window.location.origin}/restablecer-password`
      })
      .catch(() => undefined)
  } finally {
    enviando.value = false
    enviado.value = true
  }
}
</script>
