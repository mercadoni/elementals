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

interface Cryptic {
  bulkEncrypt: (rawValues: (object | string | number)[]) => CrypticResponse[],
  bulkDecrypt: (encryptedValues: CrypticResponse[]) => object[]
}

const cryptic = (algorithm: Algorithm | string, key: string): Cryptic => {
  const bulkEncrypt = (rawValues: (object | string | number)[]): CrypticResponse[] => {
    return rawValues.map((value: any) => encrypt(algorithm, key, value))
  }

  const bulkDecrypt = (encryptedValues: CrypticResponse[]): object[] => {
    return encryptedValues.map((value: CrypticResponse) => decrypt(algorithm, key, value))
  }

  return { bulkEncrypt, bulkDecrypt }
}

export default cryptic
