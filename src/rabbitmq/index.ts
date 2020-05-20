import amqp, { AmqpConnectionManager } from 'amqp-connection-manager'
import { ConfirmChannel, ConsumeMessage, Options } from 'amqplib'
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

interface ExchangeConfig {
  name: string,
  type?: string,
  options?: Options.AssertExchange
}

type MessageProcessor = (eventData: any, message: ConsumeMessage) => Promise<any>

interface ChannelConfig {
  inputExchange: ExchangeConfig,
  inputQueue: string
  pattern: string,
  errorExchange: string,
  errorQueue?: string,
  prefetch?: number,
  processor: MessageProcessor
}

interface ConsumerOptions extends Options.Consume {
  prefetch?: number
}

interface RabbitMQ {
  /**
  * @deprecated since version 0.7.0. Use consumer instead
  */
  addListener: (channelConfig: ChannelConfig) => void
  /**
  * @deprecated since version 0.7.0. Use publisher instead
  */
  publish: (exchange: string, type: string, routingKey: string, data: any) => Promise<void>
  consumer: (queue: string, options: ConsumerOptions, processor: MessageProcessor) => void
  publisher: (exchange: string) => Publisher
}

interface Publisher {
  publish: (routingKey: string, data: any, options?: Options.Publish) => Promise<void>
}

const newConnection = (conf: any): AmqpConnectionManager => {
  const hosts: string[] = conf.host.split(',')
  const protocol = conf.protocol || 'amqps'
  const urls = hosts.map(host => `${protocol}://${conf.username}:${conf.password}@${host}`)
  const connection = amqp.connect(urls)
  connection.on('connect', () => logger.info('connection_established', { protocol, hosts, username: conf.username }))
  connection.on('disconnect', ({ err }) => logger.error('disconnected', {}, err))
  return connection
}

const wrapper = (configName: string): RabbitMQ => {
  const conf = config.get(configName)
  const consumerConnection = newConnection(conf)
  const publisherConnection = newConnection(conf)

  const addListener = (channelConfig: ChannelConfig) => {
    const { inputExchange, inputQueue, pattern, errorExchange } = channelConfig
    const errorQueue = channelConfig.errorQueue ?? `${inputQueue}_errors`
    const prefetch = channelConfig.prefetch ?? 1

    const onMessage = async (message: ConsumeMessage | null) => {
      if (message !== null) {
        countIncomingMessage(inputQueue)
        const contentAsString = message.content.toString()
        try {
          const eventData = JSON.parse(contentAsString)
          try {
            await channelConfig.processor(eventData, message)
            channelWrapper.ack(message)
          } catch (err) {
            countIncomingError(inputQueue)
            const context = Object.assign(message, { content: eventData })
            logger.error('processing_failed', context, err)
            channelWrapper.nack(message, false, false)
          }
        } catch (err) {
          countIncomingError(inputQueue)
          const context = Object.assign(message, { content: contentAsString })
          logger.error('parsing_failed', context, err)
          channelWrapper.nack(message, false, false)
        }
      }
    }

    const channelWrapper = consumerConnection.createChannel({
      json: true,
      setup: (channel: ConfirmChannel) => {
        return Promise.all([
          channel.assertExchange(errorExchange, 'topic'),
          channel.assertQueue(errorQueue, { durable: true }),
          channel.assertExchange(inputExchange.name, inputExchange.type || 'topic', inputExchange.options),
          channel.assertQueue(inputQueue, {
            durable: true,
            deadLetterExchange: errorExchange,
            deadLetterRoutingKey: inputQueue
          }),
          channel.prefetch(prefetch),
          channel.bindQueue(inputQueue, inputExchange.name, pattern),
          channel.bindQueue(errorQueue, errorExchange, inputQueue),
          channel.consume(inputQueue, onMessage)
        ])
      }
    })

    channelWrapper.on('connect', () => {
      logger.info('listener_running', { queue: inputQueue, exchange: inputExchange.name, pattern })
    })
  }

  const publish = async (exchange: string, type: string, routingKey: string, data: any) => {
    try {
      countOutgoingMessage(exchange, routingKey)
      const publisherChannel = publisherConnection.createChannel({
        json: true,
        setup: (channel: ConfirmChannel) => {
          return channel.assertExchange(exchange, type)
        }
      })
      await publisherChannel.publish(exchange, routingKey, data, { contentType: 'application/json', persistent: true })
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

  const consumer = (queue: string, options: ConsumerOptions, processor: MessageProcessor) => {
    const prefetch = options.prefetch ?? 1
    const onMessage = async (message: ConsumeMessage | null) => {
      if (message !== null) {
        countIncomingMessage(queue)
        const contentAsString = message.content.toString()
        try {
          const eventData = JSON.parse(contentAsString)
          try {
            await processor(eventData, message)
            consumerChannel.ack(message)
          } catch (err) {
            countIncomingError(queue)
            const context = Object.assign(message, { content: eventData })
            logger.error('processing_failed', context, err)
            consumerChannel.nack(message, false, false)
          }
        } catch (err) {
          countIncomingError(queue)
          const context = Object.assign(message, { content: contentAsString })
          logger.error('parsing_failed', context, err)
          consumerChannel.nack(message, false, false)
        }
      }
    }
    const consumerChannel = consumerConnection.createChannel({
      json: true,
      setup: (channel: ConfirmChannel) => {
        return Promise.all([
          channel.checkQueue(queue),
          channel.prefetch(prefetch),
          channel.consume(queue, onMessage, options)
        ])
      }
    })
    consumerChannel.on('connect', () => {
      logger.info('consumer_running', { queue })
    })
  }

  const publisher = (exchange: string) => {
    const publisherChannel = publisherConnection.createChannel({
      json: true,
      setup: (channel: ConfirmChannel) => {
        return channel.checkExchange(exchange)
      }
    })
    const publish = async (routingKey: string, data: any, options?: Options.Publish) => {
      try {
        countOutgoingMessage(exchange, routingKey)
        const mergedOptions = Object.assign({ contentType: 'application/json', persistent: true }, options)
        await publisherChannel.publish(exchange, routingKey, data, mergedOptions)
        const context = { body: data, exchange, routingKey }
        logger.info('message_published', context)
      } catch (err) {
        countOutgoingError(exchange, routingKey)
        const context = { body: data, exchange, routingKey }
        logger.error('message_publishing_failed', context, err)
        throw err
      }
    }
    return {
      publish
    }
  }

  return {
    addListener,
    publish,
    consumer,
    publisher
  }
}

export type { RabbitMQ, ChannelConfig, ExchangeConfig }
export default wrapper
