import schedule, { RecurrenceRule, RecurrenceSpecDateRange, RecurrenceSpecObjLit, JobCallback } from 'node-schedule'
import Logger from '../logger'

const logger = Logger('scheduler')

const runTask = (f: any): JobCallback => {
  return async (_scheduledTime) => {
    logger.debug(`Running [${f.name}] task...`)
    try {
      await f()
      logger.debug(`Task [${f.name}] finished`)
    } catch (err) {
      logger.error('Task failed', { name: f.name }, err)
    }
  }
}

export const scheduleJob = (expression: RecurrenceRule | RecurrenceSpecDateRange | RecurrenceSpecObjLit | Date | string, f: any) => {
  schedule.scheduleJob(expression, runTask(f))
}
