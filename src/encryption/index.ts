
import Logger from '../logger'
import config from '../config'
import * as AWS from '@aws-crypto/client-node'

export declare type EncryptionContext = {
  [index: string]: string;
};

const logger = Logger('encryption')

export interface Encryption {
  encrypt: (plaintext: string, context: EncryptionContext) => Promise<string>
  decrypt: (ciphertext: string, context: EncryptionContext) => Promise<string>
}

const newKeyring = (conf: any): AWS.KeyringNode => {
  if (!conf || !conf.generator_key_id || !conf.key_ids) {
    const error = new Error('INVALID_ENCRYPTION_CONFIG')
    logger.error('Verify AWS Encryption keys configuration', {}, error)
    throw error
  }

  const generatorKeyId = conf.generator_key_id
  const keyIds : string[] = conf.key_ids.split(',')
  const keyring = new AWS.KmsKeyringNode({ generatorKeyId, keyIds })
  return keyring
}

const encryption = (configName: string): Encryption => {
  const conf = config.get(configName)
  const keyring = newKeyring(conf)

  const encrypt = async (plaintext: string, context: EncryptionContext): Promise<string> => {
    const { result } = await AWS.encrypt(keyring, plaintext, { encryptionContext: context })
    return result.toString('base64')
  }

  const decrypt = async (ciphertext: string, context: EncryptionContext) : Promise<string> => {
    const buff = Buffer.from(ciphertext, 'base64')
    const { plaintext, messageHeader } = await AWS.decrypt(keyring, buff)
    const { encryptionContext } = messageHeader

    Object.entries(context).forEach(([key, value]) => {
      if (encryptionContext[key] !== value) {
        const error = new Error('Encryption Context does not match expected values')
        logger.error('Encrypted message is corrupted or untrustworthy', context, error)
        throw error
      }
    })

    return plaintext.toString()
  }

  return {
    encrypt,
    decrypt
  }
}

export default encryption
