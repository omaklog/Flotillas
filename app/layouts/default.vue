<template>
  <div>
    <!-- `usuario` es null en las páginas públicas (login, recuperar/restablecer contraseña) —
    ahí no hay nada que cerrar ni menú de perfil que mostrar. -->
    <v-app-bar v-if="usuario" flat class="app-bar-glass">
      <v-app-bar-title class="text-section-title">Flotillas</v-app-bar-title>
      <v-spacer />
      <AppNotificacionesAlertas />
      <AppMenuPerfil />
    </v-app-bar>

    <v-main class="bg-background">
      <slot />
    </v-main>
  </div>
</template>

<script setup lang="ts">
// Layout sin navegación lateral: lo usan las páginas públicas (login, recuperar
// contraseña) y, por ahora, las páginas de operario (T022 no define un layout propio
// para ese rol — ver tasks.md).
const { usuario } = useAuth()
</script>
