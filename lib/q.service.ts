import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Logger } from '@nestjs/common';
import { Subject, QueueType, QueueOption } from './q.types'
import { Consumer } from './consumer'
import { Producer } from './producer';
import { QMetadataScanner } from './q.metadata.scanner';
import { QueueOptionsStorage } from './queue.options.storage';
import { QConfig } from './q.config';
import { NatsConnection, connect } from 'nats'

@Injectable()
export class QService implements OnApplicationBootstrap, OnModuleDestroy {
  public readonly consumers = new Map<Subject, Consumer>();
  public readonly producers = new Map<Subject, Producer>();

  constructor(private readonly config: QConfig, private readonly metadataScanner: QMetadataScanner) {}

  public async onApplicationBootstrap(): Promise<void> {
    const queueOptions = QueueOptionsStorage.getQueueOptions();
    const connection: NatsConnection = await connect(this.config.option)

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

  async initProducers(option: QueueOption, connection: NatsConnection) {

  }

  async initConsumers(option: QueueOption, connection: NatsConnection) {

  }

  async listStreams() {
    
  }

  public onModuleDestroy() {

  }
}