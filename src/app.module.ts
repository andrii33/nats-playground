import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppMessageHandler } from './app.handlers';
import { QueueOptions, QModule, QConfig } from '../lib'
import { ConfigModule, ConfigService } from '@nestjs/config'

export enum TestQueue {
  namePrefix = 'stream',
  streamName = 'stream_testCatalog1',
  subject = 'stream_testCatalog1.run'
}
const testQueueOptions: QueueOptions = [
  {
    namePrefix: TestQueue.namePrefix,
    consumerOptions: {
    },
    producerOptions: {
      autoCreate: true,
    }
  },
]

@Module({
  imports: [
    QModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService) => {
        const config = { servers: 'nats://127.0.0.1:4222' }
        return new QConfig(config);
      },
      inject: [ConfigService],
    }),
    ...testQueueOptions.map(option => QModule.registerQueue(option))
  ],
  controllers: [AppController],
  providers: [
    // {
    //   provide: AppService,
    //   useFactory: async () => {
    //     const service = new AppService()
    //     await service.init()
    //     return service;
    //   },
    // }
    AppMessageHandler, AppService],
})

export class AppModule {}
