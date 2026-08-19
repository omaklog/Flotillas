/** Mismo formato ya usado en el Dashboard (`PanelPrincipal.vue`) — moneda MXN, es-MX. */
export function formatearMoneda(valor: number): string {
  return valor.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}
