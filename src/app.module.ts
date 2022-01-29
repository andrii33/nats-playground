import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppMessageHandler } from './app.handlers';
import { QueueOptions, QModule, QConfig, QueueType } from '../lib'
import { ConfigModule, ConfigService } from '@nestjs/config'

export enum TestQueue {
  namePrefix = 'stream',
  streamName = 'stream_testCatalog1',
  subject = 'stream_testCatalog1.run'
}
const testQueueOptions: QueueOptions = [
  {
    namePrefix: 'stream',
    type: QueueType.All,
    consumerOptions: {
      concurrentLimit: 10, // Maximum concurrency per concurrentGroupId
      activationIntervalSec: 2, // Add/Reduce concurrent consumers within the interval
      concurrentGroupId: 'someSharedConcurrencyId', // Id that will be used to share concurrentLimit between active consumers
      ackWaitSec: 60, // Time to process message before redelivery
      batchSize: 10, // Number of messages to fetch in 1 request
      pollIntervalSec: 30, // Interval to check for new messages if queue is empty
      retryLimit: 5, // Times to retry message processing in case of failure
    },
    producerOptions: {
      autoCreate: true, // Create new Stream if it does not exist
    }
  },
]

@Module({
  imports: [
    QModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService) => {
        const config = { 
          servers: 'nats://127.0.0.1:4222',
          waitOnFirstConnect: true,
          reconnectJitter: 5000,
          maxReconnectAttempts: 3
        }
        return new QConfig(config);
      },
      inject: [ConfigService],
    }),
    ...testQueueOptions.map(option => QModule.registerQueue(option))
  ],
  controllers: [AppController],
  providers: [
    AppMessageHandler, AppService],
})

export class AppModule {}
