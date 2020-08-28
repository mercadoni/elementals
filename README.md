# Elementals
Building blocks for NodeJS services


## Logger

### Mask data

To mask sensitive information each method (debug, error, info) receives `maskedFields`:

``` js
logger.info(message, data, maskedFields)
```

`maskedFields` is a list of name fields to be masked, it's possible to mask nested JSON by using the field.subfield notation.

#### Examples

- Plain (Depth 0)

  ``` js
  const maskedFields = ['client']
  logger.info('Incoming request', {base: 'POST /jobs/', client:'<test>', body:... }, maskedFields)
  ```
  Result
  ``` log
  {
      "message": "Incoming request,
      "data": {
          "base": "POST /jobs/",
          "client": "*****",
          "body": {
              ...
          }
      }
  }
  ```
- Nested Fields

  Example data request:
  ``` js
  data = {
        baseUrl: 'POST /jobs/',
        client: '<test>',
        body: {
          client_reference: '<ref_test>',
          origin: {
            name: 'Store',
            ...
          }
        }
  ```
  - Depth 1
    ``` js
    const maskedFields = ['body.origin']
    logger.info('Incoming request', data, maskedFields)
    ```
    Result
    ``` log
    {
        "message": "Incoming request,
        "data": {
            "base": "POST /jobs/",
            "client": "<test>",
            "body": {
                "client_reference": "<ref_test>",
                "origin": "*******"
                ...
            }
        }
    }
    ```

  - Depth 2
    ``` js
    const maskedFields = ['body.origin.name']
    logger.info('Incoming request', data, maskedFields)
    ```
    Result
    ``` log
    {
        "message": "Incoming request,
        "data": {
            "base": "POST /jobs/",
            "client": "<test>",
            "body": {
                "client_reference": "<ref_test>",
                "origin":{
                  "name": "*****",
                }
                ...
            }
        }
    }
    ```

## Cryptic

This service can encrypt and decrypt data using any algorithm available in `openssl list -cipher-algorithms`, for this purpose is necessary to define a key accordingly with the algorithm chosen, in case of using `aes-256-cbc` the key used in the examples has a length of 32 bytes.

### Encrypt

``` js
import { encrypt, Algorithm } from '...'
const plaintext = 'h1dd3n_message'
const key = 'Y0ur4p1tokenpr0v1d3dby_123d4g34p'
const crypticResponse = encrypt(Algorithm.AES_256, key, plaintext)
```

The response consists of the iv and the encryptedData both are necessary to decrypt the message.

### Decrypt

``` js
import { decrypt, Algorithm } from '...'
const key = 'Y0ur4p1tokenpr0v1d3dby_123d4g34p'
const decryptedMessage = decrypt(Algorithm.AES_256, key, crypticResponse)
```

### Bulk Encryption/Decryption

It's possible to encrypt/decrypt a list of objects generating a pair of {iv, encryptedData} for each one, so they can be decrypted individually latter on. First, you have to define the algorithm and key to be used for the bulk operations.
``` js
import cryptic, { Algorithm } from '...'
const key = 'Y0ur4p1tokenpr0v1d3dby_123d4g34p'
const cryptic = cryptic(Algorithm.AES_256, key)
```

Then each encrypt/decrypt function call will only need the values to be encrypted/decrypted.
``` js
const objects = [...]
const crypticResponses = cryptic.BulkEncrypt(objects)
const decryptedObjects = cryptic.BulkDecrypt(crypticResponses)
```
