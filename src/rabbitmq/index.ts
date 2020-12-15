import amqp, { AmqpConnectionManager } from 'amqp-connection-manager'
import { ConfirmChannel, ConsumeMessage, Options, MessageProperties } from 'amqplib'
import { Counter, Histogram } from 'prom-client'
import Logger from '../logger'
import config from '../config'

const logger = Logger('rabbitmq')

const incomingMessages = new Histogram({
  name: 'elementals_amqp_incoming_messages',
  help: 'Messages processed, by queue and status, along with the processing time in seconds',
  labelNames: ['queue', 'outcome'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 360, 600, 1800]
})

const outgoingMessages = new Counter({
  name: 'elementals_amqp_outgoing_messages',
  help: 'Messages produced',
  labelNames: ['exchange', 'routingKey', 'outcome']
})

const countIncomingMessage = (queue: string, outcome: string, properties: MessageProperties) => {
  const time = properties.timestamp ? Date.now() - properties.timestamp : 0
  logger.debug('elapsed_time', { queue, outcome, time })
  incomingMessages.observe({ queue, outcome }, time / 1000)
}

const countOutgoingMessage = (exchange: string, routingKey: string, outcome: string) => {
  outgoingMessages.inc({ exchange, routingKey, outcome }, 1)
}

type MessageProcessor = (eventData: any, message: ConsumeMessage) => Promise<any>

export interface ChannelConfig {
  inputExchange: string,
  inputExchangeType?: string,
  inputQueue: string
  pattern: string,
  errorExchange: string,
  prefetch?: number,
  processor: MessageProcessor
}

interface ConsumerOptions extends Options.Consume {
  prefetch?: number
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
  const legacyPublisherChannel = publisherConnection.createChannel({ json: true })

  const addListener = (channelConfig: ChannelConfig) => {
    const { inputExchange, inputQueue, pattern, errorExchange } = channelConfig
    const inputExchangeType = channelConfig.inputExchangeType || 'topic'
    const errorQueue = `${inputQueue}_errors`
    const prefetch = channelConfig.prefetch ?? 1

    const onMessage = async (message: ConsumeMessage | null) => {
      if (message !== null) {
        const contentAsString = message.content.toString()
        try {
          const eventData = JSON.parse(contentAsString)
          try {
            await channelConfig.processor(eventData, message)
            channelWrapper.ack(message)
            countIncomingMessage(inputQueue, 'success', message.properties)
          } catch (err) {
            const outcome = 'processing_failed'
            countIncomingMessage(inputQueue, outcome, message.properties)
            const context = Object.assign(message, { content: eventData })
            logger.error(outcome, context, err)
            channelWrapper.nack(message, false, false)
          }
        } catch (err) {
          const outcome = 'parsing_failed'
          countIncomingMessage(inputQueue, outcome, message.properties)
          const context = Object.assign(message, { content: contentAsString })
          logger.error(outcome, context, err)
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
          channel.assertExchange(inputExchange, inputExchangeType),
          channel.assertQueue(inputQueue, {
            durable: true,
            deadLetterExchange: errorExchange,
            deadLetterRoutingKey: inputQueue
          }),
          channel.prefetch(prefetch),
          channel.bindQueue(inputQueue, inputExchange, pattern),
          channel.bindQueue(errorQueue, errorExchange, inputQueue),
          channel.consume(inputQueue, onMessage)
        ])
      }
    })

    channelWrapper.on('connect', () => {
      logger.info('listener_running', { queue: inputQueue, exchange: inputExchange, pattern })
    })
  }

  const publish = async (exchange: string, type: string, routingKey: string, data: any, options?: Options.Publish) => {
    try {
      await legacyPublisherChannel.addSetup((channel: ConfirmChannel) => {
        channel.assertExchange(exchange, type)
      })
      const mergedOptions = Object.assign({ contentType: 'application/json', persistent: true, timestamp: Date.now() }, options)
      await legacyPublisherChannel.publish(exchange, routingKey, data, mergedOptions)
      countOutgoingMessage(exchange, routingKey, 'success')
      const message = 'RabbitMQ message published'
      const context = { body: data, exchange, routingKey }
      logger.info(message, context)
    } catch (err) {
      countOutgoingMessage(exchange, routingKey, 'failure')
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
        const contentAsString = message.content.toString()
        try {
          const eventData = JSON.parse(contentAsString)
          try {
            await processor(eventData, message)
            consumerChannel.ack(message)
            countIncomingMessage(queue, 'success', message.properties)
          } catch (err) {
            const outcome = 'processing_failed'
            countIncomingMessage(queue, outcome, message.properties)
            const context = Object.assign(message, { content: eventData })
            logger.error(outcome, context, err)
            consumerChannel.nack(message, false, false)
          }
        } catch (err) {
          const outcome = 'parsing_failed'
          countIncomingMessage(queue, outcome, message.properties)
          const context = Object.assign(message, { content: contentAsString })
          logger.error(outcome, context, err)
          consumerChannel.nack(message, false, false)
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
        const mergedOptions = Object.assign({ contentType: 'application/json', persistent: true, timestamp: Date.now() }, options)
        await publisherChannel.publish(exchange, routingKey, data, mergedOptions)
        countOutgoingMessage(exchange, routingKey, 'success')
        const context = { body: data, exchange, routingKey }
        logger.info('message_published', context)
      } catch (err) {
        countOutgoingMessage(exchange, routingKey, 'failure')
        const context = { body: data, exchange, routingKey }
        logger.error('message_publishing_failed', context, err)
        throw err
      }
    }
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
