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
