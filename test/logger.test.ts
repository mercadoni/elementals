import Logger from '../src/logger'
import { info, debug, error } from 'winston'
import VError from 'verror'

jest.mock('winston', () => {
  const mFormat = {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
    label: jest.fn(),
    colorize: jest.fn(),
    json: jest.fn()
  }
  const mTransports = {
    Console: jest.fn(),
    File: jest.fn()
  }

  const mInfo = jest.fn()
  const mDebug = jest.fn()
  const mError = jest.fn()

  const mLogger = {
    info: mInfo,
    error: mError,
    debug: mDebug
  }

  return {
    format: mFormat,
    transports: mTransports,
    createLogger: jest.fn(() => mLogger),
    info: mInfo,
    debug: mDebug,
    error: mError
  }
})

describe('Logger', () => {
  const logger = Logger('test')
  let data: any

  beforeEach(() => {
    data = {
      baseUrl: 'POST /jobs/',
      client: 'TEST',
      body: {
        client_reference: 'JU_TEST',
        recipient: {
          name: 'Test Cliente',
          email: 'test@instaleap.io',
          phone_number: '123456789',
          identification: {
            type: 'PASS',
            number: 'AS1123'
          }
        },
        origin: {
          name: 'Store',
          address: 'Calle 123',
          address_two: 'Parque la 93',
          country: 'Colombia',
          city: 'Bogota',
          state: 'Cundinamarca',
          zip_code: '57'
        }
      }
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should mask the info data with depth 0', () => {
    const maskedFields = ['client']
    const expectedData = data
    expectedData.client = '*'.repeat(data.client.length)
    logger.info('Incoming info', data, maskedFields)
    expect(info).toBeCalled()
    expect(info).toBeCalledWith('Incoming info', { data: expectedData })
  })

  it('should mask the info data with depth 1', () => {
    const maskedFields = ['body.client_reference']
    const expectedData = data
    expectedData.body.client_reference = '*'.repeat(data.body.client_reference.length)
    logger.info('Incoming info', data, maskedFields)
    expect(info).toBeCalled()
    expect(info).toBeCalledWith('Incoming info', { data: expectedData })
  })

  it('should mask the info data with depth 2', () => {
    const maskedFields = ['body.recipient.identification']
    const expectedData = data
    expectedData.body.recipient.identification = '*'.repeat(data.body.recipient.identification.length)
    logger.info('Incoming info', data, maskedFields)
    expect(info).toBeCalled()
    expect(info).toBeCalledWith('Incoming info', { data: expectedData })
  })

  it('should mask the info data with depth 3', () => {
    const maskedFields = ['body.recipient.identification.number']
    const expectedData = data
    expectedData.body.recipient.identification.number = '*'.repeat(data.body.recipient.identification.number.length)
    logger.info('Incoming info', data, maskedFields)
    expect(info).toBeCalled()
    expect(info).toBeCalledWith('Incoming info', { data: expectedData })
  })

  it('should mask the data in the error logger', () => {
    const maskedFields = ['client']
    const expectedData = data
    const err = new Error('ERROR')
    const stacktrace = VError.fullStack(err)
    expectedData.client = '*'.repeat(data.client.length)
    logger.error('Request error', data, err, maskedFields)
    expect(error).toBeCalled()
    expect(error).toBeCalledWith('Request error', { data: expectedData, stacktrace })
  })

  it('should mask the data in the debug logger', () => {
    const maskedFields = ['client']
    const expectedData = data
    expectedData.client = '*'.repeat(data.client.length)
    logger.debug('Incoming info', data, maskedFields)
    expect(debug).toBeCalled()
    expect(debug).toBeCalledWith('Incoming info', { data: expectedData })
  })
})
