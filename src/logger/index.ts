import { createLogger, format, transports } from 'winston'
import { VError } from 'verror'
import logfmt from 'logfmt'
import flat from 'flat'
import config from '../config'
const { combine, timestamp, label, printf, colorize, json } = format

const maskData = require('maskdata')
const level = config.get('log_level') || 'debug'
const devLog = config.get('dev_log')
const silent = config.get('log_silent') || false
const maskSymbol = config.get('mask_symbol') ?? '*'

export const formats = (tag: string) => {
  return {
    logfmt: combine(
      label({ label: tag }),
      timestamp(),
      colorize(),
      printf(info => {
        const { timestamp, label, level, message, ...data } = info
        return `[${timestamp}] ${level} ${message} label=${label} ${logfmt.stringify(flat(data))}`
      })
    ),
    json: combine(
      label({ label: tag }),
      timestamp(),
      json()
    )
  }
}

const maskRequestData = (input: JSON, maskedFields: string []) => {
  const maskJSONOptions = {
    maskWith: maskSymbol,
    fields: maskedFields
  }
  return maskData.maskJSONFields(input, maskJSONOptions)
}

interface Logger {
  debug: (message: string, data?: any, maskedFields?: string[]) => void
  info: (message: string, data?: any, maskedFields?: string[]) => void
  error: (message: string, data: any, err: any, maskedFields?: string[]) => void
}

const logger = (tag: string): Logger => {
  const taggedFormats = formats(tag)
  const format = devLog ? taggedFormats.logfmt : taggedFormats.json
  const log = createLogger({
    level,
    format,
    transports: [new transports.Console()],
    silent
  })
  const error = (message: string, data: any, err: Error, maskedFields?: string[]) => {
    const stacktrace = VError.fullStack(err)
    data = maskedFields ? maskRequestData(data, maskedFields) : data
    log.error(message, { data, stacktrace })
  }
  const info = (message: string, data?: any, maskedFields?: string[]) => {
    data = maskedFields ? maskRequestData(data, maskedFields) : data
    log.info(message, { data })
  }
  const debug = (message: string, data?: any, maskedFields?: string[]) => {
    data = maskedFields ? maskRequestData(data, maskedFields) : data
    log.debug(message, { data })
  }

  return { debug, info, error }
}

export default logger
