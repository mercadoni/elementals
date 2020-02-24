import amqp from 'amqp-connection-manager'
import { ConfirmChannel, ConsumeMessage } from 'amqplib'
import { Counter } from 'prom-client'
import Logger from '../logger'
import config from '../config'

const logger = Logger('rabbitmq')

const totalIncomingMessages = new Counter({
  name: 'elementals_amqp_incoming_total',
  help: 'Messages processed',
  labelNames: ['queue']
})

const failedIncomingMessages = new Counter({
  name: 'elementals_amqp_incoming_errors_total',
  help: 'Errors found',
  labelNames: ['queue']
})

const totalOutgoingMessages = new Counter({
  name: 'elementals_amqp_outgoing_total',
  help: 'Messages produced',
  labelNames: ['exchange', 'routingKey']
})

const failedOutgoingMessages = new Counter({
  name: 'elementals_amqp_outgoing_errors_total',
  help: 'Errors found',
  labelNames: ['exchange', 'routingKey']
})

const countIncomingMessage = (queue: string) => {
  totalIncomingMessages.inc({ queue }, 1, Date.now())
}

const countIncomingError = (queue: string) => {
  failedIncomingMessages.inc({ queue }, 1, Date.now())
}

const countOutgoingMessage = (exchange: string, routingKey: string) => {
  totalOutgoingMessages.inc({ exchange, routingKey }, 1, Date.now())
}

const countOutgoingError = (exchange: string, routingKey: string) => {
  failedOutgoingMessages.inc({ exchange, routingKey }, 1, Date.now())
}

interface ChannelConfig {
  inputExchange: string,
  inputExchangeType?: string,
  inputQueue: string
  pattern: string,
  errorExchange: string
  processor: (eventData: any, message: ConsumeMessage) => Promise<any>
}

const wrapper = (configName: string) => {
  const conf = config.get(configName)
  const hosts: string[] = conf.host.split(',')
  const protocol = conf.protocol || 'amqps'
  const urls = hosts.map(host => `${protocol}://${conf.username}:${conf.password}@${host}`)
  const connection = amqp.connect(urls)
  const publisherChannelWrapper = connection.createChannel({ json: true })
  connection.on('connect', () => {
    logger.info('Connected to RabbitMQ', { protocol, hosts, username: conf.username })
  })
  connection.on('disconnect', ({ err }) => logger.error('Connection error', {}, err))

  const addListener = (channelConfig: ChannelConfig) => {
    const inputExchange = channelConfig.inputExchange
    const inputExchangeType = channelConfig.inputExchangeType || 'topic'
    const inputQueue = channelConfig.inputQueue
    const pattern = channelConfig.pattern
    const errorExchange = channelConfig.errorExchange
    const errorQueue = `${inputQueue}_errors`

    const onMessage = async (message: ConsumeMessage | null) => {
      if (message !== null) {
        countIncomingMessage(inputQueue)
        try {
          const eventData = JSON.parse(message.content.toString())
          try {
            await channelConfig.processor(eventData, message)
            channelWrapper.ack(message)
          } catch (err) {
            countIncomingError(inputQueue)
            const errorMessage = 'RabbitMQ event processing failed'
            const context = Object.assign(message, { content: eventData })
            logger.error(errorMessage, context, err)
            channelWrapper.nack(message, false, false)
          }
        } catch (err) {
          countIncomingError(inputQueue)
          const errorMessage = 'RabbitMQ event processing failed'
          logger.error(errorMessage, message, err)
          channelWrapper.nack(message, false, false)
        }
      }
    }

    const registerConsumer = (channel: ConfirmChannel) => {
      channel.consume(channelConfig.inputQueue, onMessage)
    }

    const channelWrapper = connection.createChannel({
      json: true,
      setup: (channel: ConfirmChannel) => {
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
      const queue = channelConfig.inputQueue
      const binding = `${inputExchange} -> ${pattern}`
      logger.info('Listening for messages', { queue, binding })
    }
    channelWrapper.on('connect', reportConnection)
  }

  const publish = async (exchange: string, type: string, routingKey: string, data: any) => {
    try {
      countOutgoingMessage(exchange, routingKey)
      await publisherChannelWrapper.addSetup((channel: ConfirmChannel) => {
        channel.assertExchange(exchange, type)
      })
      await publisherChannelWrapper.publish(exchange, routingKey, data, { contentType: 'application/json', persistent: true })
      const message = 'RabbitMQ message published'
      const context = { body: data, exchange, routingKey }
      logger.info(message, context)
    } catch (err) {
      countOutgoingError(exchange, routingKey)
      const errorMessage = 'RabbitMQ message publishing failed'
      const context = { body: data, exchange, routingKey }
      logger.error(errorMessage, context, err)
      throw err
    }
  }

  return {
    addListener,
    publish
  }
}

export default wrapper
