import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Logger } from '@nestjs/common'
import { QueueType, QueueOption, StreamName, QueueNamePrefix } from './q.types'
import { Consumer } from './consumer'
import { Producer } from './producer'
import { QMetadataScanner } from './q.metadata.scanner'
import { QueueOptionsStorage } from './queue.options.storage'
import { QConfig } from './q.config'
import { ConcurrencyBalancer } from './concurrency-balancer'
import { sleep, streamToSubject } from './q.utils'
import { NatsConnection, connect, JetStreamManager } from 'nats'

@Injectable()
export class QService implements OnApplicationBootstrap, OnModuleDestroy {
  public readonly consumers = new Map<StreamName, Consumer>()
  public readonly producers = new Map<StreamName, Producer>()
  public readonly concurrencyBalancers = new Map<string, ConcurrencyBalancer>()
  private connection?: NatsConnection
  private queueOptions?: Map<QueueNamePrefix, QueueOption>
  private jetStreamManager?: JetStreamManager
  private readonly log = new Logger(QService.name)

  constructor(private readonly config: QConfig, private readonly metadataScanner: QMetadataScanner) {}

  /**
   * Init consumers and producers
   */
  public async onApplicationBootstrap(): Promise<void> {
    const queueOptions = QueueOptionsStorage.getQueueOptions()
    await this.initConnection()
    this.queueOptions = new Map(queueOptions.map(o => [o.namePrefix, o]))

    const queueConsumerOptions = queueOptions.filter(
      (v) => v.type === QueueType.All || v.type === QueueType.Consumer,
    );
    const queueProducerOptions = queueOptions.filter(
      (v) => v.type === QueueType.All || v.type === QueueType.Producer,
    );
    for (const option of queueProducerOptions) {
      this.initProducers(option, this.connection)
    }
    for (const option of queueConsumerOptions) {
      this.initConsumers(option, this.connection)
    }
  }

  /**
   * Creates connection and handles connection closed event
   */
   async initConnection() {
    this.log.log(`Init Connection...`)
    this.connection = this.config.connection ?? await connect(this.config.option)
    this.jetStreamManager = await this.connection.jetstreamManager();
    (async () => {
      this.log.log(`connected ${this.connection.getServer()}`);
      for await (const s of this.connection.status()) {
        this.log.log(`${s.type}: ${s.data}`);
      }
    })().then()
    this.connection.closed().then(async (err) => {
      this.log.error(
        `Connection closed ${err ? " with error: " + err.message : ""}`,
      )
      await this.onModuleDestroy()
      await this.onApplicationBootstrap()
    })
  }

  /**
   * @param option 
   * @param connection 
   */
  private async initProducers(option: QueueOption, connection: NatsConnection) {
    const streams = await this.listStreamsByPattern(option.namePrefix)
    await Promise.all(streams.map(s => this.initProducer(s, connection, option)))
  }

  /**
   * @param option 
   * @param connection 
   */
  private async initConsumers(option: QueueOption, connection: NatsConnection) {
    while (true) {
      try {
        const streams = await this.listStreamsByPattern(option.namePrefix)
        await Promise.all(streams.map(s => this.initConsumer(s, connection, option)))
      } catch (err) {
        this.log.warn(err)
      }
      await sleep(30)
    }
  }

  /**
   * @param streamName 
   * @param connection 
   * @param option 
   * @returns 
   */
  async initConsumer(streamName: StreamName, connection: NatsConnection, option: QueueOption) {
    if (this.consumers.has(streamName)) return
    const metadata = this.metadataScanner.metadatas.get(option.namePrefix);
    if (!metadata) {
      throw new Error('no consumer metadata provided.');
    }
    const {
      messageHandler: { batch, handleMessage },
      eventHandler: eventHandlers,
    } = metadata;
    const consumerOptions = option.consumerOptions ?? {}
    try {
      const consumer = await Consumer.instance(
        connection, 
        { 
          ...consumerOptions, 
          streamName: streamName,
          subject: streamToSubject(streamName),
          handleMessage
        }
      )
      // Add event handlers
      for (const eventMetadata of eventHandlers) {
        if (!eventMetadata) continue
        consumer.addListener(eventMetadata.eventName, eventMetadata.handleEvent)
      }
      consumer.start()
      this.consumers.set(streamName, consumer)
      this.trackConsumerConcurrency(consumer, option)
    } catch (err) {
      Logger.error(err)
    }
    Logger.log(`Consumer ${streamName} added.`)
  }

  /**
   * @param streamName 
   * @param connection 
   * @param option 
   * @returns 
   */
  async initProducer(streamName: StreamName, connection: NatsConnection, option?: QueueOption) {
    if (this.producers.has(streamName)) return this.producers.get(streamName)
    if (!option) option = this.getProducerOption(streamName)
    if (!option) return
    const producerOptions = option.producerOptions ?? {} 
    try {
      const producer = await Producer.instance(
        connection, 
        {
          ...producerOptions,
          streamName: streamName,
          subject: streamToSubject(streamName),
        }
      )
      this.producers.set(streamName, producer)
    } catch (err) {
      Logger.error(err)
    }
    Logger.log(`Producer ${streamName} added.`)

    return this.producers.get(streamName)
  }

  /**
   * @param consumer 
   * @param options 
   * @returns 
   */
  private trackConsumerConcurrency(consumer: Consumer, options: QueueOption) {
    const consumerOptions = options.consumerOptions
    if (!consumerOptions?.concurrentLimit) return
    const groupId = this.concurrencyGroupId(options)
    let balancer = this.concurrencyBalancers.get(groupId) 
    if (!balancer) {
      balancer = ConcurrencyBalancer.instance(consumerOptions)
      this.concurrencyBalancers.set(groupId, balancer)
      balancer.start()
    }
    balancer.trackConsumer(consumer)
  }

  /**
   * Consumer concurrency groupId
   * @param options 
   * @returns 
   */
  concurrencyGroupId(options: QueueOption) {
    return options?.consumerOptions?.concurrentGroupId ?? options.namePrefix
  }

  /**
   * @param streamName 
   * @returns 
   */
  getProducerOption(streamName: StreamName) {
    if (!this.queueOptions) return
    for (const [prefix, option] of this.queueOptions.entries()) {
      const autoCreate = option?.producerOptions?.autoCreate ?? true
      if (streamName.startsWith(prefix) && autoCreate) return option
    }
  }

  /**
   * Provide streams' names that starts with queueNamePrefix
   * @param queueNamePrefix 
   * @returns 
   */
  async listStreamsByPattern(queueNamePrefix: QueueNamePrefix) {
    const streams = await this.listStreams()
    const filteredStreams: StreamName[] = []
    streams.forEach((stream) => {
      if (!stream.config.name.startsWith(queueNamePrefix)) return
      filteredStreams.push(stream.config.name)
    })

    return filteredStreams
  }

  /**
   * @returns 
   */
  private async listStreams() {
    if (!this.jetStreamManager) throw new Error('jetStreamManager is not defined')
    return this.jetStreamManager.streams.list().next()
  }

  /**
   * Stop all the async processors
   */
  public async onModuleDestroy() {
    // stop consumers
    for (const consumer of this.consumers.values()) {
      consumer.stop()
    }
    // stop concurrency balancers
    QueueOptionsStorage.getQueueOptions().filter(
      (option) => (option.type === QueueType.All || option.type === QueueType.Consumer) && option?.consumerOptions?.concurrentLimit
    ).map(
      (option) => this.concurrencyBalancers.get(this.concurrencyGroupId(option))?.stop()
    )
    try {
      await this.connection?.drain()
    } catch (err) {
      this.log.warn(err)
    }
    this.consumers.clear()
    this.producers.clear()
  }

  /**
   * Send a message to the NATS stream
   * @param streamName 
   * @param data 
   * @returns 
   */
  public async send<T = any>(streamName: StreamName, data: T) {
    if (!this.connection) throw new Error('Nats connection is not defined')
    const producer = await this.initProducer(streamName, this.connection)

    if (!producer) {
      throw new Error(`Producer does not exist: ${streamName}`);
    }
    return producer.publish(typeof data !== 'string' ? JSON.stringify(data) : data)
  }
}