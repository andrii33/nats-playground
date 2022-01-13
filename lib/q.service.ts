import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Logger } from '@nestjs/common';
import { QueueType, QueueOption, StreamName, QueueNamePrefix, Metadata } from './q.types'
import { Consumer } from './consumer'
import { Producer } from './producer';
import { QMetadataScanner } from './q.metadata.scanner';
import { QueueOptionsStorage } from './queue.options.storage';
import { QConfig } from './q.config';
import { NatsConnection, connect, JetStreamManager, StreamInfo } from 'nats'
@Injectable()
export class QService implements OnApplicationBootstrap, OnModuleDestroy {
  public readonly consumers = new Map<StreamName, Consumer>()
  public readonly producers = new Map<StreamName, Producer>()
  private connection: NatsConnection
  private queueOptions: Map<QueueNamePrefix, QueueOption>
  private jetStreamManager: JetStreamManager

  constructor(private readonly config: QConfig, private readonly metadataScanner: QMetadataScanner) {}

  public async onApplicationBootstrap(): Promise<void> {
    const queueOptions = QueueOptionsStorage.getQueueOptions();
    this.connection = await connect(this.config.option)
    this.jetStreamManager = await this.connection.jetstreamManager()
    this.queueOptions = new Map(queueOptions.map(o => [o.namePrefix, o]))

    const queueConsumerOptions = queueOptions.filter(
      (v) => v.type === QueueType.All || v.type === QueueType.Consumer,
    );
    const queueProducerOptions = queueOptions.filter(
      (v) => v.type === QueueType.All || v.type === QueueType.Producer,
    );
    for (const option of queueProducerOptions) {
      await this.initProducers(option, this.connection)
    }
    for (const option of queueConsumerOptions) {
      await this.initConsumers(option, this.connection)
    }
  }

  private async initProducers(option: QueueOption, connection: NatsConnection) {
    const streams = await this.listStreamsByPattern(option.namePrefix)
    await Promise.all(streams.map(s => this.initProducer(s, connection, option)))
  }

  private async initConsumers(option: QueueOption, connection: NatsConnection) {
    const streams = await this.listStreamsByPattern(option.namePrefix)
    await Promise.all(streams.map(s => this.initConsumer(s, connection, option)))
  }

  async initConsumer(streamName: StreamName, connection: NatsConnection, option: QueueOption) {
    const metadata: Metadata = this.metadataScanner.metadatas.get(option.namePrefix);
    if (!metadata) {
      throw new Error('no consumer metadata provided.');
    }
    const {
      messageHandler: { batch, handleMessage },
      eventHandler: eventHandlers,
    } = metadata;

    try {
      const consumer = await Consumer.instance(connection, {...option.consumerOptions, handleMessage})
      consumer.start()
      this.consumers.set(streamName, consumer)
    } catch (err) {
      Logger.error(err)
    }
    
    // TODO add even listeners
  }

  async initProducer(streamName: StreamName, connection: NatsConnection, option?: QueueOption) {
    if (this.producers.has(streamName)) return this.producers.get(streamName)
    if (!option) option = this.getProducerOption(streamName)
    if (!option) return
    try {
      const producer = await Producer.instance(connection, option.producerOptions)
      this.producers.set(streamName, producer)
    } catch (err) {
      Logger.error(err)
    }

    return this.producers.get(streamName)
  }

  getProducerOption(streamName: StreamName) {
    for (const [prefix, option] of this.queueOptions.entries()) {
      const autoCreate = option?.producerOptions.autoCreate ?? true
      if (streamName.startsWith(prefix) && autoCreate) return option
    }
  }

  async listStreamsByPattern(queueNamePrefix: QueueNamePrefix) {
    const streams = await this.listStreams()
    const filteredStreams: StreamName[] = []
    streams.forEach((stream) => {
      if (!stream.config.name.startsWith(queueNamePrefix)) return
      filteredStreams.push(stream.config.name)
    })

    return filteredStreams
  }

  private async listStreams() {
    return this.jetStreamManager.streams.list().next()
  }

  public onModuleDestroy() {
    for (const consumer of this.consumers.values()) {
      consumer.stop();
    }
  }

  public async send<T = any>(streamName: StreamName, data: T) {
    const producer = await this.initProducer(streamName, this.connection)

    if (!producer) {
      throw new Error(`Producer does not exist: ${streamName}`);
    }

    return producer.publish(JSON.stringify(data))
  }
}