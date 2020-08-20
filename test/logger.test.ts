import Logger from '../src/logger'
import { info } from 'winston'

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

  const mLogger = {
    info: mInfo
  }

  return {
    format: mFormat,
    transports: mTransports,
    createLogger: jest.fn(() => mLogger),
    info: mInfo
  }
})

describe('Request Logger', () => {
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

  it('should mask the request data with depth 0', () => {
    const maskedFields = ['client']
    const expectedData = data
    expectedData.client = '*'.repeat(data.client.length)
    logger.request('Incoming request', data, maskedFields)
    expect(info).toBeCalled()
    expect(info).toBeCalledWith('Incoming request', { data: expectedData })
  })

  it('should mask the request data with depth 1', () => {
    const maskedFields = ['body.client_reference']
    const expectedData = data
    expectedData.body.client_reference = '*'.repeat(data.body.client_reference.length)
    logger.request('Incoming request', data, maskedFields)
    expect(info).toBeCalled()
    expect(info).toBeCalledWith('Incoming request', { data: expectedData })
  })

  it('should mask the request data with depth 2', () => {
    const maskedFields = ['body.recipient.identification']
    const expectedData = data
    expectedData.body.recipient.identification = '*'.repeat(data.body.recipient.identification.length)
    logger.request('Incoming request', data, maskedFields)
    expect(info).toBeCalled()
    expect(info).toBeCalledWith('Incoming request', { data: expectedData })
  })

  it('should mask the request data with depth 3', () => {
    const maskedFields = ['body.recipient.identification.number']
    const expectedData = data
    expectedData.body.recipient.identification.number = '*'.repeat(data.body.recipient.identification.number.length)
    logger.request('Incoming request', data, maskedFields)
    expect(info).toBeCalled()
    expect(info).toBeCalledWith('Incoming request', { data: expectedData })
  })
})
