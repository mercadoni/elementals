'use strict'

const amqp = require('amqp-connection-manager')
const logger = require('../logger')('rabbitmq')
const config = require('../config')

module.exports = (configName) => {
  const conf = config.get(configName)
  const url = `amqp://${conf.username}:${conf.password}@${conf.host}:${conf.port}`

  const connection = amqp.connect([url])
  const publisherChannelWrapper = connection.createChannel({ json: true })
  connection.on('connect', params => logger.info(`Connected to ${conf.host}`))
  connection.on('disconnect', params => logger.error(`Disconnected. ${params.err.stack}`))

  const addListener = (channelConfig) => {
    const inputExchange = channelConfig.inputExchange
    const inputExchangeType = channelConfig.inputExchangeType || 'topic'
    const inputQueue = channelConfig.inputQueue
    const pattern = channelConfig.pattern
    const errorExchange = channelConfig.errorExchange
    const errorQueue = `${inputQueue}_errors`

    const onMessage = async (message) => {
      try {
        const eventData = JSON.parse(message.content.toString())
        try {
          await channelConfig.processor(eventData, message)
          channelWrapper.ack(message)
        } catch (err) {
          const errorMessage = 'RabbitMQ event processing failed'
          const context = Object.assign(message, {content: eventData})
          logger.logError(errorMessage, context, err)
          channelWrapper.nack(message, false, false)
        }
      } catch (err) {
        const errorMessage = 'RabbitMQ event processing failed'
        logger.logError(errorMessage, message, err)
        channelWrapper.nack(message, false, false)
      }
    }

    const registerConsumer = (channel) => {
      if (channelConfig.consume) {
        channel.consume(channelConfig.inputQueue, onMessage)
      }
    }

    const channelWrapper = connection.createChannel({
      json: true,
      setup: (channel) => {
        Promise.all([
          channel.assertExchange(errorExchange, 'topic'),
          channel.assertQueue(errorQueue, { durable: true }),
          channel.assertExchange(inputExchange, inputExchangeType),
          channel.assertQueue(inputQueue, {
            durable: true,
            deadLetterExchange: errorExchange,
            deadLetterRoutingKey: inputQueue
          }),
          channel.prefetch(1),
          channel.bindQueue(inputQueue, inputExchange, pattern),
          channel.bindQueue(errorQueue, errorExchange, inputQueue),
          registerConsumer(channel)
        ])
      }
    })

    const reportConnection = () => {
      logger.info(`Listening for messages at ${channelConfig.inputQueue} (${inputExchange} -> ${pattern})`)
    }

    channelWrapper.waitForConnect().then(reportConnection)
  }

  const publish = async (exchange, type, routingKey, data) => {
    try {
      await publisherChannelWrapper.addSetup(channel => {
        channel.assertExchange(exchange, type)
      })
      await publisherChannelWrapper.publish(exchange, routingKey, data, { contentType: 'application/json', persistent: true })
      const message = 'RabbitMQ message published'
      const context = {body: data, exchange, routingKey}
      logger.logInfo(message, context)
    } catch (err) {
      const errorMessage = 'RabbitMQ message publishing failed'
      const context = {body: data, exchange, routingKey}
      logger.logError(errorMessage, context, err)
      throw err
    }
  }

  return {
    addListener,
    publish
  }
}
