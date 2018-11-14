'use strict'

const config = require('../config')
const mongoist = require('mongoist')
const _logger = require('../logger')

module.exports = (configName) => {
  const conf = config.get(configName)
  const logger = _logger(configName)
  const url = conf.url
  const options = Object.assign(conf.options, { poolSize: conf.options.pool })
  delete options.pool
  const db = mongoist(url, options)
  const collection = (name) => {
    return db.collection(name)
  }
  const id = (_id) => {
    return mongoist.ObjectId(_id)
  }
  logger.info(`Connection to MongoDB using config [${configName}] is up`)
  return {
    collection,
    id
  }
}
