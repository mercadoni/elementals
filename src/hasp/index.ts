import Logger from '../logger'

const logger = Logger('hasp')

const getClient = (config: any, includeLogs: boolean) => (
  _req: any,
  _res: any,
  _next: any
) => {
  const haspToken = _req.get('x-api-key')
  if (haspToken) {
    const reqClientId = config[haspToken]
    if (reqClientId) {
      if (includeLogs) {
        logger.info('REQUEST INITIATED', {
          baseUrl: `${_req.method} ${_req.originalUrl}`,
          client: reqClientId,
          body: _req.body,
          params: _req.params,
          query: _req.query
        })
      }
      _req.body.client_id = reqClientId
      _next()
    } else {
      if (includeLogs) {
        logger.info('CLIENT NOT FOUND', {
          baseUrl: `${_req.method} ${_req.originalUrl}`,
          token: haspToken,
          body: _req.body,
          params: _req.params,
          query: _req.query
        })
      }
      return accessForbidden(_res)
    }
  } else {
    if (includeLogs) {
      logger.info('INVALID API KEY', {
        baseUrl: `${_req.method} ${_req.originalUrl}`,
        token: haspToken,
        body: _req.body
      })
    }
    return accessForbidden(_res)
  }
}

const accessForbidden = (_res: any) => {
  return _res
    .status(403)
    .json({ message: 'Access forbidden. Please provide a valid API token' })
}

export default [
  getClient
]
