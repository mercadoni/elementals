import amqp from 'amqp-connection-manager'
import { ConfirmChannel, ConsumeMessage, Options, MessageProperties } from 'amqplib'
import { Counter, Histogram } from 'prom-client'
import Logger from '../logger'
import config from '../config'

const logger = Logger('rabbitmq')

const totalIncomingMessages = new Counter({
  name: 'elementals_rabbitmq_incoming_total',
  help: 'Messages processed',
  labelNames: ['queue']
})

const failedIncomingMessages = new Counter({
  name: 'elementals_rabbitmq_incoming_errors_total',
  help: 'Errors found',
  labelNames: ['queue']
})

const initializeQueueMetrics = (queue: string) => {
  totalIncomingMessages.inc({ queue }, 0)
  failedIncomingMessages.inc({ queue }, 0)
}

const totalOutgoingMessages = new Counter({
  name: 'elementals_rabbitmq_outgoing_total',
  help: 'Messages produced',
  labelNames: ['exchange']
})

const failedOutgoingMessages = new Counter({
  name: 'elementals_rabbitmq_outgoing_errors_total',
  help: 'Errors found',
  labelNames: ['exchange']
})

const countIncomingMessage = (queue: string, properties: MessageProperties) => {
  totalIncomingMessages.inc({ queue }, 1)
  const time = properties.timestamp ? Date.now() - properties.timestamp : 0
  waitingDuration.observe({ queue }, time / 1000)
}

const countIncomingError = (queue: string) => {
  failedIncomingMessages.inc({ queue }, 1)
}

const countOutgoingMessage = (exchange: string) => {
  totalOutgoingMessages.inc({ exchange }, 1)
}

const countOutgoingError = (exchange: string) => {
  failedOutgoingMessages.inc({ exchange }, 1)
}

const waitingDuration = new Histogram({
  name: 'elementals_rabbitmq_waiting_duration_seconds',
  help: 'Time that messages spent waiting in the queue before they are picked up by the consumers',
  labelNames: ['queue'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 360, 600, 1800]
})

const processingDuration = new Histogram({
  name: 'elementals_rabbitmq_processing_duration_seconds',
  help: 'Time that consumers spent processing messages from a queue',
  labelNames: ['queue'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]
})

export interface ChannelConfig {
  inputExchange: string,
  inputExchangeType?: string,
  inputQueue: string
  pattern: string,
  errorExchange: string,
  prefetch?: number,
  processor: (eventData: any, message: ConsumeMessage) => Promise<any>
}

export interface RabbitMQ {
  addListener: (channelConfig: ChannelConfig) => void
  publish: (exchange: string, type: string, routingKey: string, data: any, options?: Options.Publish) => Promise<void>
}

const wrapper = (configName: string): RabbitMQ => {
  const conf = config.get(configName)
  const hosts: string[] = conf.host.split(',')
  const protocol = conf.protocol || 'amqps'
  const urls = hosts.map(host => `${protocol}://${conf.username}:${conf.password}@${host}`)
  const connection = amqp.connect(urls)
  const publisherChannelWrapper = connection.createChannel({ json: true })
  connection.on('connect', () => logger.info('Connected', { protocol, hosts, username: conf.username }))
  connection.on('disconnect', ({ err }) => logger.error('Disconnected', {}, err))

  const addListener = (channelConfig: ChannelConfig) => {
    const inputExchange = channelConfig.inputExchange
    const inputExchangeType = channelConfig.inputExchangeType || 'topic'
    const inputQueue = channelConfig.inputQueue
    const pattern = channelConfig.pattern
    const errorExchange = channelConfig.errorExchange
    const errorQueue = `${inputQueue}_errors`
    const prefetch = channelConfig.prefetch ?? 1
    initializeQueueMetrics(inputQueue)

    const onMessage = async (message: ConsumeMessage | null) => {
      if (message !== null) {
        countIncomingMessage(inputQueue, message.properties)
        const end = processingDuration.startTimer({ queue: inputQueue })
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
        } finally {
          end()
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
          channel.prefetch(prefetch),
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

  const publish = async (exchange: string, type: string, routingKey: string, data: any, options?: Options.Publish) => {
    try {
      countOutgoingMessage(exchange)
      await publisherChannelWrapper.addSetup((channel: ConfirmChannel) => {
        channel.assertExchange(exchange, type)
      })
      const mergedOptions = Object.assign({ contentType: 'application/json', persistent: true, timestamp: Date.now() }, options)
      await publisherChannelWrapper.publish(exchange, routingKey, data, mergedOptions)
      const message = 'RabbitMQ message published'
      const context = { body: data, exchange, routingKey }
      logger.info(message, context)
    } catch (err) {
      countOutgoingError(exchange)
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
