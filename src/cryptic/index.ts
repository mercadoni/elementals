import * as crypto from 'crypto'
import Logger from '../logger'

const logger = Logger('cryptic')

export enum Algorithm {
  AES_256 = 'aes-256-cbc',
}

interface CrypticResponse {
  iv: string,
  encryptedData: string
}

export const encrypt = (algorithm: Algorithm | string, key: string, rawValue: object | string | number, encode: boolean = false): CrypticResponse | string => {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv)
  let encrypted = cipher.update(JSON.stringify(rawValue))
  encrypted = Buffer.concat([encrypted, cipher.final()])

  const crypticResponse = {
    iv: iv.toString('base64'),
    encryptedData: encrypted.toString('base64')
  }

  if (encode) {
    return Buffer.from(JSON.stringify(crypticResponse)).toString('base64')
  }

  return crypticResponse
}

export const decrypt = (algorithm: Algorithm | string, key: string, encryptedValue: CrypticResponse | string, encoded: boolean = false): object => {
  if (encoded) {
    try {
      encryptedValue = JSON.parse(Buffer.from(encryptedValue as string, 'base64').toString())
    } catch (err) {
      const error = new Error('INVALID_ENCODED_CRYPTIC_RESPONSE')
      logger.error('The encryptedValue does not represent a valid JSON of encoded CrypticResponse', encryptedValue, error)
      throw error
    }
  }

  const crypticResponse = encryptedValue as CrypticResponse

  if (!crypticResponse.iv || !crypticResponse.encryptedData) {
    const error = new Error('INVALID_CRYPTIC_RESPONSE')
    logger.error('The encryptedValue does not represent a valid CrypticResponse', encryptedValue, error)
    throw error
  }

  const iv = Buffer.from(crypticResponse.iv, 'base64')
  const encryptedText = Buffer.from(crypticResponse.encryptedData, 'base64')
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return JSON.parse(decrypted.toString())
}

interface Cryptic {
  bulkEncrypt: (rawValues: (object | string | number)[], encode: boolean) => (CrypticResponse | string)[],
  bulkDecrypt: (encryptedValues: CrypticResponse[], encoded: boolean) => object[]
}

const cryptic = (algorithm: Algorithm | string, key: string): Cryptic => {
  const bulkEncrypt = (rawValues: (object | string | number)[], encode: boolean = false): (CrypticResponse | string)[] => {
    return rawValues.map((value: any) => encrypt(algorithm, key, value, encode))
  }

  const bulkDecrypt = (encryptedValues: (CrypticResponse | string)[], encoded: boolean = false): object[] => {
    return encryptedValues.map((value: (CrypticResponse | string)) => decrypt(algorithm, key, value, encoded))
  }

  return { bulkEncrypt, bulkDecrypt }
}

export default cryptic
