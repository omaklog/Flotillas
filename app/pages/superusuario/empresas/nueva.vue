<template>
  <div>
    <h1 class="text-page-title mb-6">Nueva empresa</h1>

    <v-alert v-if="empresaCreada" type="success" class="mb-6" data-testid="alta-exitosa">
      Empresa <strong>{{ empresaCreada.nombreEmpresa }}</strong> creada. Se envió una invitación por
      correo a su primer administrador.
    </v-alert>

    <EmpresasFormularioAltaEmpresa v-else @creada="onCreada" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'superusuario' })

const empresaCreada = ref<{ empresaId: string; usuarioId: string; nombreEmpresa: string } | null>(
  null
)

function onCreada(payload: { empresaId: string; usuarioId: string; nombreEmpresa: string }) {
  empresaCreada.value = payload
}
</script>
