import { createLogger, format, transports } from 'winston'
import { VError } from 'verror'
import logfmt from 'logfmt'
import flat from 'flat'
import config from '../config'
const { combine, timestamp, label, printf, colorize, json } = format

const level = config.get('log_level') || 'debug'
const logFormat = config.get('log_format')
const maxDepth = config.get('log_max_depth') ?? 3
const silent = config.get('log_silent') || false

export const formats = (tag: string) => {
  return {
    logfmt: combine(
      label({ label: tag }),
      timestamp(),
      colorize(),
      printf(info => {
        const { timestamp, label, level, message, ...data } = info
        const logData = { ...data.data, stacktrace: data.stacktrace }
        Object.keys(logData).forEach(key => logData[key] === undefined && delete logData[key])
        const logOptions = { maxDepth }
        return `[${timestamp}] ${message} level=${level} label=${label} ${logfmt.stringify(flat(logData, logOptions))}`
      })
    ),
    json: combine(
      label({ label: tag }),
      timestamp(),
      json()
    )
  }
}

interface Logger {
  debug: (message: string, data?: any) => void
  info: (message: string, data?: any) => void
  error: (message: string, data: any, err: any) => void
}

const logger = (tag: string): Logger => {
  const taggedFormats = formats(tag)
  const format = logFormat === 'logfmt' ? taggedFormats.logfmt : taggedFormats.json
  const log = createLogger({
    level,
    format,
    transports: [new transports.Console()],
    silent
  })
  const error = (message: string, data: any, err: Error) => {
    const stacktrace = VError.fullStack(err)
    log.error(message, { data, stacktrace })
  }
  const info = (message: string, data?: any) => {
    log.info(message, { data })
  }
  const debug = (message: string, data?: any) => {
    log.debug(message, { data })
  }
  return { debug, info, error }
}

export default logger
