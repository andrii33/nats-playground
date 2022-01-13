import { Q_CONSUMER_METHOD, Q_CONSUMER_EVENT_HANDLER, Q_PROCESS, QConsumerEvent, QueueNamePrefix } from '.'
import { SetMetadata } from '@nestjs/common'

export const QMessageHandler = (batch?: boolean): MethodDecorator => SetMetadata(Q_CONSUMER_METHOD, { batch })

export const QConsumerEventHandler = (eventName: QConsumerEvent): MethodDecorator =>
  SetMetadata(Q_CONSUMER_EVENT_HANDLER, { eventName })

export const QProcess = (namePrefix: QueueNamePrefix): ClassDecorator => SetMetadata(Q_PROCESS, { namePrefix })