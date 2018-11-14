const { createLogger, format, transports } = require('winston')
const { combine, timestamp, label, printf } = format
const VError = require('verror')

const config = require('../config')
const level = config.get('log_level') || 'debug'

const myFormat = printf(info => {
  return `${info.timestamp} [${info.label}][${process.pid}] ${info.level}: ${info.message}`
})

const logger = (tag) => {
  let log = createLogger({
    level,
    format: combine(
      format.splat(),
      label({ label: tag }),
      timestamp(),
      myFormat
    ),
    transports: [new transports.Console()]
  })
  log.logError = (message, data, err) => {
    const errorData = {
      message,
      data,
      stacktrace: VError.fullStack(err)
    }
    log.error(`${message} ${JSON.stringify(errorData)}`)
  }
  log.logInfo = (message, data) => {
    const infoData = {
      message,
      data
    }
    log.info(`${message} ${JSON.stringify(infoData)}`)
  }
  return log
}

module.exports = logger
