import { JsMsg } from 'nats'

export type StreamName = string
export type Subject = string

export type ConsumerOptions = {
  streamName: StreamName,
  subject: Subject,
  handleMessage: (message: JsMsg) => Promise<void>
  batchCount?: number,
  pollInterval?: number,
  retryLimit?: number,
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
  consumerOptions?: ConsumerOptions;
  producerOptions?: ProducerOptions;
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