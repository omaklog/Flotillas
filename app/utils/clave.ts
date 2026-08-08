const LONGITUD_MAXIMA_CLAVE = 50

/**
 * Normaliza un nombre a formato de clave (mismo patrón que las claves ya
 * sembradas: `ligero`, `pesado`, `mat_peligrosos`): minúsculas, sin
 * diacríticos, cualquier carácter fuera de [a-z0-9] se vuelve `_`, sin `_`
 * repetidos ni al inicio/fin, máximo 50 caracteres. Coincide exactamente con
 * el `CHECK (clave ~ '^[a-z0-9_]+$' AND char_length(clave) <= 50)` de
 * `tipos_vehiculo`/`permisos` (ver research.md R2/R7).
 */
export function normalizarClave(nombre: string): string {
  const sinDiacriticos = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')

  const conGuionesBajos = sinDiacriticos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  return conGuionesBajos.slice(0, LONGITUD_MAXIMA_CLAVE).replace(/_$/, '')
}
