import { mocked } from 'ts-jest/utils'
import * as AWS from '@aws-crypto/client-node'
import Encryption, { EncryptionContext } from '../src/encryption/index'
import config from '../src/config/index'

jest.mock('@aws-crypto/client-node')

const mockedAWS = mocked(AWS, true)

describe('Encryption', () => {
  let plaintext : string
  let context: EncryptionContext
  let messageHeader: any
  let ciphertext: string

  beforeAll(() => {
    config.set('aws:generator_key_id', '<generatorKeyId>')
    config.set('aws:key_ids', '<keyID>')

    ciphertext = '3ncrypT3d_M355ag3'
    plaintext = 'h1dd3n_message'
    context = {
      purpose: 'test',
      target: 'mocked service'
    }

    messageHeader = {
      version: 1,
      type: 128,
      suiteId: 20,
      messageId: Buffer.from(''),
      encryptionContext: context,
      encryptedDataKeys: [],
      contentType: 1,
      headerIvLength: 12,
      frameLength: 1
    }

    mockedAWS.encrypt.mockResolvedValue(
      {
        messageHeader: messageHeader,
        result: Buffer.from(ciphertext, 'base64')
      })

    mockedAWS.decrypt.mockResolvedValue(
      {
        messageHeader: messageHeader,
        plaintext: Buffer.from(plaintext)
      })
  })

  it('should throw an error when AWS keys are not configured', () => {
    expect(() => { Encryption('bad_AWS') }).toThrowError(new Error('INVALID_ENCRYPTION_CONFIG'))
  })

  it('should encrypt the message', async () => {
    const encryption = Encryption('aws')
    const encryptedMessage = await encryption.encrypt(plaintext, context)
    expect(mockedAWS.encrypt).toBeCalled()
    expect(encryptedMessage).toBeTruthy()
  })

  it('should decrypt the message', async () => {
    const encryption = Encryption('aws')
    const decryptedMessage = await encryption.decrypt(ciphertext, context)
    expect(mockedAWS.decrypt).toBeCalled()
    expect(decryptedMessage).toBeTruthy()
    expect(decryptedMessage).toBe(plaintext)
  })

  it('should fail to decrypt the message if the context is invalid', async () => {
    const encryption = Encryption('aws')
    const invalidContext = {
      purpose: 'production',
      target: 'mocked service'
    }
    await expect(encryption.decrypt(ciphertext, invalidContext)).rejects.toThrow(new Error('Encryption Context does not match expected values'))
  })
})
