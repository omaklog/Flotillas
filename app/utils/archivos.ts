const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png']
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024

/** Valida tipo MIME y tamaño de un archivo antes de subirlo (FR-004). `null` = válido. */
export function validarArchivo(archivo: File): string | null {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return 'El archivo debe ser PDF, JPG o PNG.'
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return 'El archivo no debe superar 10 MB.'
  }
  return null
}

/**
 * Genera un nombre de archivo único para evitar colisiones en la misma carpeta de Storage
 * (cada versión de póliza es un objeto nuevo, nunca se sobreescribe uno existente).
 */
export function nombreArchivoUnico(nombreOriginal: string): string {
  const extension = nombreOriginal.split('.').pop()?.toLowerCase() || 'pdf'
  const base = nombreOriginal
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  return `${Date.now()}-${base || 'archivo'}.${extension}`
}
