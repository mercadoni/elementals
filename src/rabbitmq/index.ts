import amqp, { AmqpConnectionManager } from 'amqp-connection-manager'
import { ConfirmChannel, ConsumeMessage, Options, MessageProperties, GetMessage } from 'amqplib'
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

const countIncomingMessage = (queue: string, properties: MessageProperties) => {
  totalIncomingMessages.inc({ queue }, 1)
  const time = properties.timestamp ? Date.now() - properties.timestamp : 0
  waitingDuration.observe({ queue }, time / 1000)
}

const countIncomingError = (queue: string, quantity: number = 1) => {
  failedIncomingMessages.inc({ queue }, quantity)
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

const initializeExchangeMetrics = (exchange: string) => {
  totalOutgoingMessages.inc({ exchange }, 0)
  failedOutgoingMessages.inc({ exchange }, 0)
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

type MessageProcessor = (eventData: any, message: ConsumeMessage) => Promise<any>

export interface ChannelConfig {
  inputExchange: string,
  inputExchangeType?: string,
  inputQueue: string
  pattern: string,
  errorExchange: string,
  prefetch?: number,
  batchQuantity?: number,
  processor: MessageProcessor
}

interface ConsumerOptions extends Options.Consume {
  prefetch?: number
}

interface Publisher {
  publish: (routingKey: string, data: any, options?: Options.Publish) => Promise<void>
}

export interface RabbitMQ {
  addListener: (channelConfig: ChannelConfig) => void
  /**
  * @deprecated since version 0.7.0. Use publisher instead
  */
  publish: (exchange: string, type: string, routingKey: string, data: any, options?: Options.Publish) => Promise<void>
  topology: (f: amqp.SetupFunc) => Promise<void>,
  consumer: (queue: string, options: ConsumerOptions, processor: MessageProcessor) => void
  publisher: (exchange: string) => Publisher
}

const newConnection = (conf: any): AmqpConnectionManager => {
  const hosts: string[] = conf.host.split(',')
  const protocol = conf.protocol || 'amqps'
  const urls = hosts.map(host => `${protocol}://${conf.username}:${conf.password}@${host}`)
  const options = {
    heartbeatIntervalInSeconds: conf.options?.heartbeat ?? 5,
    reconnectTimeInSeconds: conf.options?.reconnect ?? 5
  }
  const connection = amqp.connect(urls, options)
  connection.on('connect', () => logger.info('connection_established', { protocol, hosts, username: conf.username }))
  connection.on('disconnect', ({ err }) => logger.error('disconnected', {}, err))
  return connection
}

const wrapper = (configName: string): RabbitMQ => {
  const conf = config.get(configName)
  const consumerConnection = newConnection(conf)
  const publisherConnection = newConnection(conf)
  const legacyPublisherChannel = publisherConnection.createChannel({ json: true })

  const addListener = (channelConfig: ChannelConfig) => {
    const { inputExchange, inputQueue, pattern, errorExchange, batchQuantity } = channelConfig
    initializeQueueMetrics(inputQueue)
    const inputExchangeType = channelConfig.inputExchangeType || 'topic'
    const errorQueue = `${inputQueue}_errors`
    const prefetch = channelConfig.prefetch ?? 1

    const onMessage = async (message: ConsumeMessage | null) => {
      if (message !== null) {
        countIncomingMessage(inputQueue, message.properties)
        const contentAsString = message.content.toString()
        const end = processingDuration.startTimer({ queue: inputQueue })
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
        } finally {
          end()
        }
      }
    }

    const getMessages = async (
      quantity: number,
      channel: ConfirmChannel
    ) => {
      const messages: any[] = []
      let result
      let lastMessage: GetMessage | undefined
      try {
        do {
          result = await channel.get(inputQueue, { noAck: false })
          if (result) {
            countIncomingMessage(inputQueue, (result as GetMessage).properties)
            messages.push((result as GetMessage).content.toString())
            lastMessage = result as GetMessage
          }
        } while (--quantity && result)

        if (lastMessage) {
          const end = processingDuration.startTimer({ queue: inputQueue })
          try {
            messages.forEach((value, index) => {
              messages[index] = JSON.parse(value)
            })
            try {
              await channelConfig.processor(messages, lastMessage)
              channel.ack(lastMessage, true)
            } catch (err) {
              countIncomingError(inputQueue, messages.length)
              logger.error('processing_failed', { messages, lastMessage }, err)
              channel.nack(lastMessage, true)
            }
          } catch (err) {
            countIncomingError(inputQueue, messages.length)
            logger.error('parsing_failed', { messages, lastMessage }, err)
            channel.nack(lastMessage, true)
          } finally {
            end()
          }
        }
      } catch (err) {
        countIncomingError(inputQueue, messages.length)
        logger.error('getting_messages_failed', { messages, lastMessage }, err)
        if (lastMessage) {
          channel.nack(lastMessage, true)
        }
      }
    }

    const channelWrapper = consumerConnection.createChannel({
      json: true,
      setup: async (channel: ConfirmChannel) => {
        await Promise.all([
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
          channel.bindQueue(errorQueue, errorExchange, inputQueue)
        ])
        return batchQuantity ? getMessages(batchQuantity, channel) : channel.consume(inputQueue, onMessage)
      }
    })

    channelWrapper.on('connect', () => {
      logger.info('listener_running', { queue: inputQueue, exchange: inputExchange, pattern })
    })
  }

  const publish = async (exchange: string, type: string, routingKey: string, data: any, options?: Options.Publish) => {
    try {
      countOutgoingMessage(exchange)
      await legacyPublisherChannel.addSetup((channel: ConfirmChannel) => {
        channel.assertExchange(exchange, type)
      })
      const mergedOptions = Object.assign({ contentType: 'application/json', persistent: true, timestamp: Date.now() }, options)
      await legacyPublisherChannel.publish(exchange, routingKey, data, mergedOptions)
      const message = 'RabbitMQ message published'
      const context = { body: data, exchange, routingKey }
      logger.debug(message, context)
    } catch (err) {
      countOutgoingError(exchange)
      const errorMessage = 'RabbitMQ message publishing failed'
      const context = { body: data, exchange, routingKey }
      logger.error(errorMessage, context, err)
      throw err
    }
  }

  const consumer = (queue: string, options: ConsumerOptions, processor: MessageProcessor) => {
    initializeQueueMetrics(queue)
    const prefetch = options.prefetch ?? 1
    const onMessage = async (message: ConsumeMessage | null) => {
      if (message !== null) {
        countIncomingMessage(queue, message.properties)
        const end = processingDuration.startTimer({ queue })
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
        } finally {
          end()
        }
      }
    }
    const consumerChannel = consumerConnection.createChannel({
      json: true,
      setup: (channel: ConfirmChannel) => {
        logger.info('consumer_setup', { queue, options })
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
        countOutgoingMessage(exchange)
        const mergedOptions = Object.assign({ contentType: 'application/json', persistent: true, timestamp: Date.now() }, options)
        await publisherChannel.publish(exchange, routingKey, data, mergedOptions)
        const context = { body: data, exchange, routingKey }
        logger.debug('message_published', context)
      } catch (err) {
        countOutgoingError(exchange)
        const context = { body: data, exchange, routingKey }
        logger.error('message_publishing_failed', context, err)
        throw err
      }
    }
    initializeExchangeMetrics(exchange)
    return {
      publish
    }
  }

  const topology = async (f: amqp.SetupFunc) => {
    const topologyChannel = consumerConnection.createChannel({
      json: true,
      setup: f
    })
    topologyChannel.on('close', () => {
      logger.info('topology_setup_finished')
    })
    topologyChannel.on('error', (err: Error, info: any) => {
      logger.error('topology_setup_failed', err, info)
    })
    await topologyChannel.waitForConnect()
    return topologyChannel.close()
  }

  return {
    addListener,
    publish,
    topology,
    consumer,
    publisher
  }
}

export default wrapper
