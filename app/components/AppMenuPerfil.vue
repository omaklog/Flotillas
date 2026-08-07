<template>
  <v-menu>
    <template #activator="{ props: activatorProps }">
      <v-btn variant="text" v-bind="activatorProps" data-testid="menu-perfil">
        <v-avatar size="32" color="primary" class="mr-2">
          <span class="text-white">{{ inicial }}</span>
        </v-avatar>
        {{ usuario?.nombre }}
      </v-btn>
    </template>
    <v-list>
      <v-list-item :title="usuario?.nombre" :subtitle="usuario?.correo" />
      <v-divider />
      <v-list-item
        title="Cerrar sesión"
        prepend-icon="mdi-logout"
        data-testid="cerrar-sesion"
        @click="cerrarSesion"
      />
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
const { usuario, cerrarSesion } = useAuth()

const inicial = computed(() => usuario.value?.nombre?.charAt(0)?.toUpperCase() ?? '?')
</script>
