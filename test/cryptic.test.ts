import { decrypt, encrypt, Algorithm } from '../src/cryptic'

describe('Encryption', () => {
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
})
