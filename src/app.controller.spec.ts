import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QConfig, QModule, QueueOptions, QueueType } from '../lib'

export enum TestQueue {
  namePrefix = 'stream',
  streamName = 'stream_testCatalog1',
  subject = 'stream_testCatalog1.run'
}

const testQueueOptions: QueueOptions = [
  {
    namePrefix: TestQueue.namePrefix,
    type: QueueType.All,
    consumerOptions: {
      concurrentLimit: 10,
      activationIntervalSec: 2
    },
    producerOptions: {
      autoCreate: true,
    }
  },
]

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [
        QModule.forRootAsync({
          useFactory: () => {
            const config = { servers: 'nats://127.0.0.1:4222' }
            return new QConfig(config);
          }
        }),
        ...testQueueOptions.map(option => QModule.registerQueue(option))
      ],
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
