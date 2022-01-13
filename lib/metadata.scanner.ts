import { Injectable, OnModuleInit } from '@nestjs/common'
import { DiscoveryService } from '@nestjs-plus/discovery/lib/discovery.service'

import { Metadata } from './q.types'
import { QMessageHandlerMeta, QConsumerEventHandlerMeta, QProcessMeta } from './q.interfaces'
import { Q_PROCESS, Q_CONSUMER_METHOD, Q_CONSUMER_EVENT_HANDLER } from './q.constants'

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
