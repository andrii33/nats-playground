import waitForExpect from 'wait-for-expect'
import { Test, TestingModule } from '@nestjs/testing'

import {
  QModule,
  QService,
  QProcess,
  QMessageHandler,
  QueueOptions,
  QConfig,
  QConsumerEventHandler,
  ConsumerEvent,
  QMessage
} from '../lib'

enum TestQueue {
  namePrefix = 'stream',
  streamName = 'stream_testCatalog1',
  subject = 'stream_testCatalog1.run'
}
const TestQueueOptions: QueueOptions = [
  {
    namePrefix: TestQueue.namePrefix,
    consumerOptions: {
    },
    producerOptions: {
      autoCreate: true
    }
  },
]

const config = { servers: 'nats://127.0.0.1:4222' }

describe('SqsModule', () => {
  let module: TestingModule
  const fakeProcessor = jest.fn()
  const fakeErrorEventHandler = jest.fn();

  @QProcess(TestQueue.namePrefix)
  class TestHandler {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    @QMessageHandler()
    public async handleTest2Message(message: QMessage) {
      fakeProcessor(message)
    }
    @QConsumerEventHandler(ConsumerEvent.ERROR)
    public handleErrorEvent(err: Error, message: QMessage) {
      fakeErrorEventHandler(err, message);
    }
  }

  describe('forRootAsync', () => {
    afterAll(async () => {
      await module.close()
    })

    it('should register sqsConfig', async () => {
      module = await Test.createTestingModule({
        imports: [
          QModule.forRootAsync({
            useFactory: async () => new QConfig(config),
          }),
        ],
      }).compile()
      const sqsConfig = module.get<QConfig>(QConfig)
      expect(sqsConfig.option).toMatchObject(config)
    })
  })

  describe('full flow', () => {
    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          QModule.forRootAsync({
            useFactory: () => new QConfig(config),
          }),
          QModule.registerQueue(...TestQueueOptions),
        ],
        providers: [TestHandler],
      }).compile()
      const qService = module.get(QService)
      jest.spyOn(qService, 'listStreamsByPattern').mockImplementation(() => Promise.resolve([TestQueue.streamName]))
      await module.init()
    })
    afterEach(() => {
      fakeProcessor.mockRestore()
      fakeErrorEventHandler.mockRestore();
    })
    afterAll(async () => {
      await module.close()
    })

    it('should register message producer', async () => {
      const qService = module.get(QService)
      await waitForExpect(
        () => {
          expect(qService.producers.has(TestQueue.streamName)).toBe(true)
        },
        5000,
        100,
      )
    })

    it('should register message handler', async () => {
      const qService = module.get(QService)
      await waitForExpect(
        () => {
          expect(qService.consumers.has(TestQueue.streamName)).toBe(true)
        },
        5000,
        100,
      )
    })

    it('should call message handler when a new message has come', async () => {
      jest.setTimeout(10000)

      const qService = module.get(QService)
      await qService.send(TestQueue.streamName, { test: true })
      await waitForExpect(
        () => {
          const message = fakeProcessor.mock.calls[0][0]
          expect(message).toBeTruthy()
          expect(JSON.parse(message.data)).toStrictEqual({ test: true })
        },
        4000,
        100,
      )
    })

    it('should call message handler multiple times when multiple messages have come', async () => {
      jest.setTimeout(10000)
      const qService = module.get(QService)
      const groupId = String(Math.floor(Math.random() * 1000000))

      for (let i = 0; i < 3; i++) {
        const id = `${groupId}_${i}`
        await qService.send(TestQueue.streamName, { test: true, id })
      }

      await waitForExpect(
        () => {
          expect(fakeProcessor.mock.calls).toHaveLength(3)
          for (const call of fakeProcessor.mock.calls) {
            expect(call).toHaveLength(1)
            expect(call[0]).toBeTruthy()
          }
        },
        5000,
        100,
      )
    })

    it('should call the registered error handler when an error occurs', async () => {
      jest.setTimeout(10000);

      const qService = module.get(QService);
      const id = String(Math.floor(Math.random() * 1000000));
      const payload = {
        id,
        body: { test: true },
      }
      
      class TestError extends Error {}
      fakeProcessor.mockImplementationOnce(() => {
        throw new TestError('test');
      });

      await qService.send(TestQueue.streamName, payload);

      await waitForExpect(
        () => {
          expect(fakeErrorEventHandler.mock.calls[0][0]).toBeTruthy();
          expect(fakeErrorEventHandler.mock.calls[0][0].constructor.name).toBe('TestError');
        },
        5000,
        100,
      );
    });
  })
})
