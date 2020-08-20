# Elementals
Building blocks for NodeJS services


## Logger

### Requests

To log HTTP requests and mask sensitive information:

``` js
logger.request(message, data, maskedFields)
```

`maskedFields` is a list of name fields to be masked, it's possible to mask nested JSON by using the field.subfield notation.

#### Examples

- Plain (Depth 0)

  ``` js
  const maskedFields = ['client']
  logger.request('Incoming request', {base: 'POST /jobs/', client:'<test>', body:... }, maskedFields)
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
    logger.request('Incoming request', data, maskedFields)
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
    logger.request('Incoming request', data, maskedFields)
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
