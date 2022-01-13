import {ConsumerEvent, QueueNamePrefix} from '.' 
import { ModuleMetadata } from '@nestjs/common';
import { QConfig } from './q.config'
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