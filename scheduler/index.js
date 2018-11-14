'use strict'

const schedule = require('node-schedule')
const logger = require('../logger')('scheduler')

const runTask = (f) => {
  return async (scheduledTime) => {
    logger.debug(`Running [${f.name}] task...`)
    try {
      await f()
      logger.debug(`Task [${f.name}] finished`)
    } catch (err) {
      logger.error(`Task [${f.name}] failed: ${err}`)
    }
  }
}

const scheduleJob = (expression, f) => {
  schedule.scheduleJob(expression, runTask(f))
}

module.exports = {
  scheduleJob
}
