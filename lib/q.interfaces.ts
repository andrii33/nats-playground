import { ConsumerEvent, QueueNamePrefix, QConsumerStatus } from './q.types' 
import { ModuleMetadata } from '@nestjs/common';
import { QConfig } from './q.config'
import { PubAck } from 'nats'
export interface QMessageHandlerMeta {
  batch?: boolean
}

export interface QConsumerEventHandlerMeta {
  eventName: ConsumerEvent
}

export interface QProcessMeta {
  namePrefix: QueueNamePrefix
}

export interface QAsyncConfig extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (...args: any[]) => QConfig | Promise<QConfig>;
  inject?: any[];
}

export interface ConcurrentConsumer {
  getStatus: () => QConsumerStatus;
  addConcurrentConsumer: () => Promise<void>
  getConcurrentConsumersCount: () => number
  removeAllConcurrentConsumers: () => void
  removeConcurrentConsumer: () => void
}

export interface AsyncProcessor {
  start: () => void
  stop: () => void
}

export interface ConcurrentController {
  trackConsumer: (consumer: ConcurrentConsumer) => void
}

export interface QueueProducer {
  publish: (data: string) => Promise<PubAck>
  batchPublish: (data: string[]) => Promise<PubAck[]>
}