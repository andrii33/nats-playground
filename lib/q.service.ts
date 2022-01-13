import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Logger } from '@nestjs/common';
import { Subject, QueueType, QueueOption, StreamName, QueueNamePrefix } from './q.types'
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
  private queueOptions: Map<QueueNamePrefix, QueueOption>
  private jetStreamManager: JetStreamManager

  constructor(private readonly config: QConfig, private readonly metadataScanner: QMetadataScanner) {}

  public async onApplicationBootstrap(): Promise<void> {
    const queueOptions = QueueOptionsStorage.getQueueOptions();
    const connection: NatsConnection = await connect(this.config.option)
    this.jetStreamManager = await connection.jetstreamManager()
    this.queueOptions = new Map(queueOptions.map(o => [o.namePrefix, o]))

    const sqsQueueConsumerOptions = queueOptions.filter(
      (v) => v.type === QueueType.All || v.type === QueueType.Consumer,
    );
    const sqsQueueProducerOptions = queueOptions.filter(
      (v) => v.type === QueueType.All || v.type === QueueType.Producer,
    );

    sqsQueueProducerOptions.forEach((option) => {
      this.initProducers(option, connection);
    });

    sqsQueueConsumerOptions.forEach(async (option) => {
      this.initConsumers(option, connection)
    });
  }

  private async initProducers(option: QueueOption, connection: NatsConnection) {
    const streams = await this.listStreamsByPattern(option.namePrefix)
    await Promise.all(streams.map(s => this.initProducer(s.config.name, connection, option)))
  }

  private async initConsumers(option: QueueOption, connection: NatsConnection) {
    const streams = await this.listStreamsByPattern(option.namePrefix)
    await Promise.all(streams.map(s => this.initConsumer(s.config.name, connection, option)))
  }

  async initConsumer(streamName: StreamName, connection: NatsConnection, option: QueueOption) {
    try {
      const consumer = await Consumer.instance(connection, option.consumerOptions)
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
    const filteredStreams: StreamInfo[] = []
    streams.forEach((stream) => {
      if (!stream.config.name.startsWith(queueNamePrefix)) return
      filteredStreams.push(stream)
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
}