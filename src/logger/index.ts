import { createLogger, format, transports } from 'winston'
import config from '../config'
import { VError } from 'verror'
const { combine, timestamp, label, simple, colorize, json } = format

const level = config.get('log_level') || 'debug'
const devLog = config.get('dev_log')

interface Logger {
  debug: (message: string, data?: any) => void
  info: (message: string, data?: any) => void
  error: (message: string, data: any, err: any) => void
}

const logger = (tag: string): Logger => {
  const formats = [
    label({ label: tag }),
    timestamp()
  ]
  if (devLog) {
    formats.push(colorize())
    formats.push(simple())
  } else {
    formats.push(json())
  }
  const log = createLogger({
    level,
    format: combine(...formats),
    transports: [new transports.Console()]
  })
  const error = (message: string, data: any, err: Error) => {
    const stacktrace = VError.fullStack(err)
    log.error({ message, data, stacktrace })
  }
  const info = (message: string, data?: any) => {
    log.info({ message, data })
  }
  const debug = (message: string, data?: any) => {
    log.debug({ message, data })
  }
  return { debug, info, error }
}

export default logger
