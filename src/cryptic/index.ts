import * as crypto from 'crypto'

export enum Algorithm {
  AES_256 = 'aes-256-cbc',
}

interface CrypticResponse {
  iv: string,
  encryptedData: string
}

export const encrypt = (algorithm: Algorithm | string, key: string, rawValue: object | string | number): CrypticResponse => {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv)
  let encrypted = cipher.update(JSON.stringify(rawValue))
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return {
    iv: iv.toString('base64'),
    encryptedData: encrypted.toString('base64')
  }
}

export const decrypt = (algorithm: Algorithm | string, key: string, encryptedValue: CrypticResponse): object => {
  const iv = Buffer.from(encryptedValue.iv, 'base64')
  const encryptedText = Buffer.from(encryptedValue.encryptedData, 'base64')
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return JSON.parse(decrypted.toString())
}
