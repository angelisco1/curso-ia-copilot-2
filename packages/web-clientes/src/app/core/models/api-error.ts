/**
 * El API usa dos formatos de error:
 *  - nuevo (dominio de mesas/sesiones): `{ error: <NombreDeClase>, message: <texto> }`
 *  - heredado (pedidos existentes y middleware): `{ error: <texto> }` sin `message`.
 */
export interface ParsedApiError {
  status: number | null
  code: string | null
  message: string | null
}

export const SESSION_ERROR_CODES = [
  'TableSessionRequiredError',
  'TableSessionForbiddenError',
  'TableSessionNotFoundError',
  'TableSessionClosedError',
  'TableSessionMismatchError'
] as const

/** Mensajes literales (en inglés) del servidor, por si un error de sesión llegara en formato heredado. */
const CODE_BY_LEGACY_MESSAGE: Record<string, string> = {
  'A table session is required to place an order': 'TableSessionRequiredError',
  'The table session does not belong to the client': 'TableSessionForbiddenError',
  'Table session not found': 'TableSessionNotFoundError',
  'The table session is closed': 'TableSessionClosedError',
  'The order does not match the restaurant or table of the session': 'TableSessionMismatchError',
  'Table is not available': 'TableNotAvailableError',
  'Party size exceeds table capacity': 'TableCapacityExceededError',
  'Client already has an active table session in this restaurant': 'ActiveTableSessionExistsError'
}

const MESSAGE_BY_CODE: Record<string, string> = {
  InvalidPartySizeError: 'El número de personas debe ser un entero positivo.',
  TableNotAvailableError: 'La mesa ya no está disponible.',
  TableCapacityExceededError: 'La mesa no tiene capacidad suficiente para el grupo.',
  ActiveTableSessionExistsError: 'Ya tienes una mesa ocupada en este restaurante.',
  TableNotFoundError: 'La mesa ya no existe.',
  RestaurantNotFoundError: 'El restaurante no existe.',
  TableSessionRequiredError: 'Necesitas ocupar una mesa antes de hacer el pedido.',
  TableSessionForbiddenError: 'La ocupación de mesa indicada no es tuya.',
  TableSessionNotFoundError: 'No se encontró tu ocupación de mesa.',
  TableSessionClosedError: 'Tu mesa ha sido liberada. Elige una mesa para continuar.',
  TableSessionMismatchError: 'El pedido no corresponde a tu mesa actual. Elige una mesa para continuar.'
}

export function parseApiError(err: unknown): ParsedApiError {
  const empty: ParsedApiError = { status: null, code: null, message: null }
  if (!err || typeof err !== 'object') return empty

  const raw = err as { status?: unknown; error?: unknown }
  const status = typeof raw.status === 'number' ? raw.status : null
  const body = raw.error

  if (typeof body === 'string') {
    return { status, code: CODE_BY_LEGACY_MESSAGE[body] ?? null, message: body }
  }
  if (body && typeof body === 'object') {
    const { error, message } = body as { error?: unknown; message?: unknown }
    if (typeof error === 'string' && typeof message === 'string') {
      return { status, code: error, message }
    }
    if (typeof error === 'string') {
      return { status, code: CODE_BY_LEGACY_MESSAGE[error] ?? null, message: error }
    }
  }
  return { status, code: null, message: null }
}

export function isSessionErrorCode(code: string | null): boolean {
  return code !== null && (SESSION_ERROR_CODES as readonly string[]).includes(code)
}

/** Texto en español para un código conocido; si no, el texto de reserva. */
export function describeTableError(parsed: ParsedApiError, fallback: string): string {
  return (parsed.code && MESSAGE_BY_CODE[parsed.code]) || fallback
}
