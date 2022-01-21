import { JsMsg } from 'nats'

export type StreamName = string
export type Subject = string

export type ConsumerOptions = {
  streamName: StreamName,
  subject: Subject,
  concurrentLimit?: number,
  concurrentGroupId?: string,
  activationIntervalSec?: number,
  handleMessage: (message: JsMsg) => Promise<void>
  ackWaitSec?: number
  batchSize?: number,
  pollInterval?: number,
  retryLimit?: number,
}

export enum ConsumerStatus {
  ACTIVE = 'active',
  DRY = 'dry',
  EMPTY = 'empty'
}

export type SqsConsumerStatus = {
  statusId: ConsumerStatus
  startTime: number
}

export type ProducerOptions = {
  streamName: string,
  subject: string,
  autoCreate?: boolean
}

export enum QueueType {
  All = 'ALL',
  Producer = 'PRODUCER',
  Consumer = 'CONSUMER',
}

export enum ConsumerEvent {
  ERROR = 'error'
}
export type QueueNamePrefix = string
export type QConsumerEvent = string

export type QueueOption = {
  namePrefix: QueueNamePrefix;
  type?: QueueType;
  consumerOptions?: Omit<ConsumerOptions, 'handleMessage' | 'streamName' |'subject'>
  producerOptions?: Omit<ProducerOptions, 'streamName' |'subject'>
};

export type QueueOptions = Array<QueueOption>;

export type Metadata = {
  namePrefix: QueueNamePrefix
  messageHandler: {
    batch?: boolean
    handleMessage: (...args: any[]) => any
  }
  eventHandler: Array<{
    eventName: string | ConsumerEvent
    handleEvent: (...args: any[]) => any
  }>
}