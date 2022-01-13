import {ConsumerEvent, QueueNamePrefix} from '.' 

export interface QMessageHandlerMeta {
  batch?: boolean
}

export interface QConsumerEventHandlerMeta {
  eventName: ConsumerEvent
}

export interface QProcessMeta {
  namePrefix: QueueNamePrefix
}