const crypto = require('crypto')
const algorithm = 'aes-256-cbc'
const iv = crypto.randomBytes(16)

interface CrypticResponse {
  iv: string,
  encryptedData: string
}

const encrypt = (key: string, rawValue: object): CrypticResponse => {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv)
  let encrypted = cipher.update(JSON.stringify(rawValue))
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') }
}

const decrypt = (key: string, rawValue: CrypticResponse): object => {
  const iv = Buffer.from(rawValue.iv, 'hex')
  const encryptedText = Buffer.from(rawValue.encryptedData, 'hex')
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return JSON.parse(decrypted.toString())
}

export default [
  encrypt,
  decrypt
]
