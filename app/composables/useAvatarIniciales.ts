// Avatares de iniciales para listados de personas (operarios, administradores, etc.) — el
// dominio no tiene foto de perfil, así que el color/iniciales se derivan solo del nombre/id.
// Paleta pastel de baja saturación, consistente con "Status Chips" de docs/design-system.md.
const PALETA_AVATAR = [
  { bg: '#DBEAFE', fg: '#1E3A8A' },
  { bg: '#FEE2E2', fg: '#991B1B' },
  { bg: '#D1FAE5', fg: '#065F46' },
  { bg: '#EDE9FE', fg: '#5B21B6' },
  { bg: '#FEF3C7', fg: '#92400E' },
  { bg: '#E0E7FF', fg: '#3730A3' }
] as const

export function useAvatarIniciales() {
  function iniciales(nombre: string): string {
    const partes = nombre.trim().split(/\s+/).filter(Boolean)
    if (partes.length === 0) return '?'
    const primera = partes[0]?.[0] ?? ''
    const segunda = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
    return (primera + segunda).toUpperCase()
  }

  function colorAvatar(semilla: string): { bg: string; fg: string } {
    let hash = 0
    for (let i = 0; i < semilla.length; i++) {
      hash = (hash * 31 + semilla.charCodeAt(i)) >>> 0
    }
    return PALETA_AVATAR[hash % PALETA_AVATAR.length]!
  }

  return { iniciales, colorAvatar }
}
