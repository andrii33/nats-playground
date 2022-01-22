import { JsMsg } from 'nats'

export type StreamName = string
export type Subject = string
export type QMessage = JsMsg

export type ConcurrentOptions = {
  concurrentLimit?: number,
  concurrentGroupId?: string,
  activationIntervalSec?: number,
}

export type ConsumerOptions = {
  streamName: StreamName,
  subject: Subject,
  handleMessage: (message: JsMsg) => Promise<void>
  ackWaitSec?: number
  batchSize?: number,
  pollInterval?: number,
  retryLimit?: number,
} & ConcurrentOptions

export type QConsumerOptions = Omit<ConsumerOptions, 'handleMessage' | 'streamName' |'subject'>
export type QProducerOptions = Omit<ProducerOptions, 'streamName' |'subject'>

export enum ConsumerStatus {
  ACTIVE = 'active',
  DRY = 'dry',
  EMPTY = 'empty'
}

export enum ConsumerEvents {
  ERROR = 'error',
  STOPPED = 'stopped',
  STARTED = 'started'
}

export type QConsumerStatus = {
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
  consumerOptions?: QConsumerOptions
  producerOptions?: QProducerOptions
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