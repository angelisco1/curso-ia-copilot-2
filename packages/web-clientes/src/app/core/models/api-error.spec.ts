import { isSessionErrorCode, parseApiError, describeTableError } from './api-error'

describe('parseApiError', () => {
  it('interpreta el formato nuevo {error, message} como código y mensaje', () => {
    const parsed = parseApiError({
      status: 409,
      error: { error: 'TableSessionClosedError', message: 'The table session is closed' }
    })
    expect(parsed).toEqual({
      status: 409,
      code: 'TableSessionClosedError',
      message: 'The table session is closed'
    })
  })

  it('interpreta el formato heredado {error: texto} sin código', () => {
    const parsed = parseApiError({ status: 400, error: { error: 'Restaurant ID is required' } })
    expect(parsed).toEqual({ status: 400, code: null, message: 'Restaurant ID is required' })
  })

  it('reconoce por su texto un error de sesión conocido recibido en formato heredado', () => {
    const parsed = parseApiError({ status: 409, error: { error: 'The table session is closed' } })
    expect(parsed.code).toBe('TableSessionClosedError')
  })

  it('tolera cuerpos de texto, vacíos y errores sin respuesta HTTP', () => {
    expect(parseApiError({ status: 500, error: 'boom' })).toEqual({ status: 500, code: null, message: 'boom' })
    expect(parseApiError({ status: 0, error: null })).toEqual({ status: 0, code: null, message: null })
    expect(parseApiError(undefined)).toEqual({ status: null, code: null, message: null })
    expect(parseApiError(new Error('x'))).toEqual({ status: null, code: null, message: null })
  })

  it('no confunde el middleware {error} con un error de dominio', () => {
    const parsed = parseApiError({ status: 403, error: { error: 'Forbidden: Insufficient permissions' } })
    expect(parsed.code).toBeNull()
    expect(parsed.message).toBe('Forbidden: Insufficient permissions')
  })
})

describe('isSessionErrorCode', () => {
  it('identifica los cuatro códigos de sesión de pedidos', () => {
    for (const c of ['TableSessionRequiredError', 'TableSessionForbiddenError', 'TableSessionNotFoundError', 'TableSessionClosedError']) {
      expect(isSessionErrorCode(c)).toBe(true)
    }
    expect(isSessionErrorCode('TableNotAvailableError')).toBe(false)
    expect(isSessionErrorCode(null)).toBe(false)
  })
})

describe('describeTableError', () => {
  it('traduce cada código conocido a un mensaje en español', () => {
    expect(describeTableError({ status: 409, code: 'TableNotAvailableError', message: 'x' }, 'fallo'))
      .toContain('ya no está disponible')
    expect(describeTableError({ status: 409, code: 'TableCapacityExceededError', message: 'x' }, 'fallo'))
      .toContain('capacidad')
    expect(describeTableError({ status: 409, code: 'ActiveTableSessionExistsError', message: 'x' }, 'fallo'))
      .toContain('Ya tienes')
    expect(describeTableError({ status: 409, code: 'TableSessionClosedError', message: 'x' }, 'fallo'))
      .toContain('liberada')
  })

  it('usa el texto de reserva ante códigos desconocidos o ausentes', () => {
    expect(describeTableError({ status: 500, code: null, message: 'boom' }, 'fallo')).toBe('fallo')
    expect(describeTableError({ status: 409, code: 'Otro', message: 'm' }, 'fallo')).toBe('fallo')
  })
})
