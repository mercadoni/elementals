import amqp from 'amqp-connection-manager'
import { ConfirmChannel, ConsumeMessage } from 'amqplib'
import Logger from '../logger'
import config from '../config'

const logger = Logger('rabbitmq')

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
  const urls = hosts.map(host => `amqp://${conf.username}:${conf.password}@${host}`)
  const connection = amqp.connect(urls)
  const publisherChannelWrapper = connection.createChannel({ json: true })
  connection.on('connect', _params => {
    logger.info('Connected to RabbitMQ', { hosts, username: conf.username })
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
        try {
          const eventData = JSON.parse(message.content.toString())
          try {
            await channelConfig.processor(eventData, message)
            channelWrapper.ack(message)
          } catch (err) {
            const errorMessage = 'RabbitMQ event processing failed'
            const context = Object.assign(message, { content: eventData })
            logger.error(errorMessage, context, err)
            channelWrapper.nack(message, false, false)
          }
        } catch (err) {
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
      await publisherChannelWrapper.addSetup((channel: ConfirmChannel) => {
        channel.assertExchange(exchange, type)
      })
      await publisherChannelWrapper.publish(exchange, routingKey, data, { contentType: 'application/json', persistent: true })
      const message = 'RabbitMQ message published'
      const context = { body: data, exchange, routingKey }
      logger.info(message, context)
    } catch (err) {
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
