import { Injectable, OnModuleInit, SetMetadata } from '@nestjs/common'
import { DiscoveryService } from '@nestjs-plus/discovery/lib/discovery.service'

//- types -//
export enum ConsumerEvent {
  ERROR = 'error'
}
export type QueueNamePrefix = string
export type QConsumerEvent = string

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
//- end types -//

// interfaces //
export interface QMessageHandlerMeta {
  batch?: boolean
}

export interface QConsumerEventHandlerMeta {
  eventName: ConsumerEvent
}

export interface QProcessMeta {
  namePrefix: QueueNamePrefix
}
//- end interfaces -//

//- constants -//
export const Q_PROCESS = Symbol.for('Q_PROCESS')
export const Q_CONSUMER_METHOD = Symbol.for('Q_CONSUMER_METHOD')
export const Q_CONSUMER_EVENT_HANDLER = Symbol.for('Q_CONSUMER_EVENT_HANDLER')
//- end constants -//

//- decorators -//
export const QMessageHandler = (batch?: boolean): MethodDecorator => SetMetadata(Q_CONSUMER_METHOD, { batch })

export const QConsumerEventHandler = (eventName: QConsumerEvent): MethodDecorator =>
  SetMetadata(Q_CONSUMER_EVENT_HANDLER, { eventName })

export const QProcess = (namePrefix: QueueNamePrefix): ClassDecorator => SetMetadata(Q_PROCESS, { namePrefix })
//- end decorators -//

@Injectable()
export class MetadataScanner implements OnModuleInit {
  public readonly metadatas = new Map<string, Metadata>()

  public constructor(private readonly discover: DiscoveryService) {}

  public async onModuleInit(): Promise<void> {
    const processes = await this.discover.providersWithMetaAtKey<QProcessMeta>(Q_PROCESS)

    await Promise.all(
      processes.map(
        (process) =>
          new Promise((resolve) => {
            const { meta, discoveredClass } = process

            const messageHandlerMetadatas = this.discover.classMethodsWithMetaAtKey<QMessageHandlerMeta>(
              discoveredClass,
              Q_CONSUMER_METHOD,
            )
            if (messageHandlerMetadatas.length > 1) {
              throw new Error("can't register multiple message handlers")
            }

            const eventHandlerMetadatas = this.discover.classMethodsWithMetaAtKey<QConsumerEventHandlerMeta>(
              discoveredClass,
              Q_CONSUMER_EVENT_HANDLER,
            )

            const {
              meta: { batch },
              discoveredMethod: messageMethod,
            } = messageHandlerMetadatas[0]

            const qMetadata: Metadata = {
              namePrefix: meta.namePrefix,
              messageHandler: {
                batch,
                handleMessage: messageMethod.handler.bind(messageMethod.parentClass.instance),
              },
              eventHandler: eventHandlerMetadatas.map((metadata) => ({
                eventName: metadata.meta.eventName,
                handleEvent: metadata.discoveredMethod.handler.bind(metadata.discoveredMethod.parentClass.instance),
              })),
            }

            resolve(this.metadatas.set(meta.namePrefix, qMetadata))
          }),
      ),
    )
  }
}
