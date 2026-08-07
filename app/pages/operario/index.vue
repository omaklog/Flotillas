<template>
  <v-container>
    <h1 class="text-page-title mb-4">Mi perfil</h1>
    <p class="text-body-main">Bienvenido, {{ usuario?.nombre }}.</p>
  </v-container>
</template>

<script setup lang="ts">
// Sin layout propio (T022 solo define default/superusuario/admin) — usa el layout default,
// que desde US10 ya trae su propio app-bar + AppMenuPerfil (con "Cerrar sesión") cuando hay
// sesión — no hace falta repetirlo aquí.
definePageMeta({ layout: 'default' })

const { usuario } = useAuth()
</script>
