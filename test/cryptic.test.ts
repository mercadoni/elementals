import lodash from 'lodash'
import cryptic, { decrypt, encrypt, Algorithm } from '../src/cryptic'

describe('Cryptic', () => {
  let plaintext : string
  let crypticResponseString: any
  let crypticResponseObject: any
  let key: string
  let plainObject: object

  beforeAll(() => {
    plaintext = 'h1dd3n_message'
    key = 'Y0ur4p1tokenpr0v1d3dby_1nst4l34p'
    plainObject = {
      level: {
        detail: '1wqeqwe',
        deep:
        {
          feats: ['1', '2']
        }
      }
    }
    crypticResponseString = encrypt(Algorithm.AES_256, key, plaintext)
    crypticResponseObject = encrypt(Algorithm.AES_256, key, plainObject)
  })

  it('should encrypt the message using a string raw object with AES-256', async () => {
    const encryptedMessage = encrypt(Algorithm.AES_256, key, plaintext)
    expect(encryptedMessage).toHaveProperty('iv')
    expect(encryptedMessage).toHaveProperty('encryptedData')
  })

  it('should encrypt the message using a raw object with AES-256', async () => {
    const encryptedMessage = encrypt(Algorithm.AES_256, key, plainObject)
    expect(encryptedMessage).toHaveProperty('iv')
    expect(encryptedMessage).toHaveProperty('encryptedData')
  })

  it('should decrypt the message for a string', async () => {
    const decryptedMessage = decrypt(Algorithm.AES_256, key, crypticResponseString)
    expect(decryptedMessage).toBe(plaintext)
  })

  it('should decrypt the message for an object', async () => {
    const decryptedMessage = decrypt(Algorithm.AES_256, key, crypticResponseObject)
    expect(decryptedMessage).toStrictEqual(plainObject)
  })

  describe('Bulk cryptic', () => {
    let bulkCryptic: any
    let rawValues: object[]
    let crypticResponseObjects: any

    beforeEach(() => {
      bulkCryptic = cryptic(Algorithm.AES_256, key)
      rawValues = lodash.times(10, () => lodash.cloneDeep(plainObject))
      crypticResponseObjects = bulkCryptic.bulkEncrypt(rawValues)
    })

    it('should encrypt a list of objects and return a different cipher for each one', () => {
      const encrypted = bulkCryptic.bulkEncrypt(rawValues)
      expect(encrypted).toHaveLength(rawValues.length)
      expect(encrypted[0]).toHaveProperty('iv')
      expect(encrypted[0]).toHaveProperty('encryptedData')
      expect(encrypted[0].encryptedData).not.toBe(encrypted[1].encryptedData)
    })

    it('should decrypt a list of objects', () => {
      const decrypted = bulkCryptic.bulkDecrypt(crypticResponseObjects)
      expect(decrypted).toHaveLength(rawValues.length)
      expect(decrypted).toStrictEqual(rawValues)
    })

    it('should encrypt/decrypt a list of numbers', () => {
      const numList = lodash.times(10, () => Math.random() * 100)
      const encrypted = bulkCryptic.bulkEncrypt(numList)
      const decrypted = bulkCryptic.bulkDecrypt(encrypted)
      expect(decrypted).toHaveLength(numList.length)
      expect(decrypted).toStrictEqual(numList)
    })
  })
})
