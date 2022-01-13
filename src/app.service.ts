import { Logger } from '@nestjs/common';

import { connect, StringCodec, NatsConnection } from 'nats'
import { Consumer, ConsumerOptions } from './consumer'
import { Producer, ProducerOptions } from './producer'

// shared stream
const streamName1 = 'productRefresh_catalog1'
const subject1 = `${streamName1}.run`
// single consumer/producer stream
const streamName2 = 'productRefresh_catalog2'
const subject2 = `${streamName2}.run`

const strCodec = StringCodec()

const consumersConfigs: ConsumerOptions[] = [
  {
    streamName: streamName1,
    subject: subject1,
    batchCount: 2,
    handleMessage: async (message) => Logger.log(`### 1${message.info.stream}[${message.seq}] ${strCodec.decode(message.data)}`)
  },
  {
    streamName: streamName1,
    subject: subject1,
    batchCount: 1,
    handleMessage: async (message) => Logger.log(`@@@ 2${message.info.stream}[${message.seq}] ${strCodec.decode(message.data)}`)
  },
  {
    streamName: streamName2,
    subject: subject1,
    batchCount: 5,
    handleMessage: async (message) => Logger.log(`!!! 3${message.info.stream}[${message.seq}] ${strCodec.decode(message.data)}`)
  }
]

const producerConfigs: ProducerOptions[] = [
  {
    streamName: streamName1,
    subject: subject1
  },
  {
    streamName: streamName2,
    subject: subject2
  }
]

export class AppService {
  private connection: NatsConnection
  private consumers: Consumer[] = []
  private producers: Producer[] = []

  async init() {
    this.connection = await connect({ servers: 'nats://127.0.0.1:4222' })
    // init producer first to create stream if it does not exist
    await Promise.all(producerConfigs.map(
      async (options) => this.producers.push(await Producer.instance(this.connection, options))
    ))

    await Promise.all(consumersConfigs.map(
      async options => this.consumers.push(await Consumer.instance(this.connection, options))
    ))
  }

  async publish(msg: Object) {
    try {
      for (let i = 0; i < 10 ; i++) {
        const data = [...Array(10).keys()].map(k => JSON.stringify({test: k}))
        await Promise.all(this.producers.map(
          async (producer) => await producer.batchPublish(data)
        ))
      }
    } catch (err) {
      Logger.log(err)
      Logger.log(err.message)
    }
  }

  async pull() {
    this.consumers.map(consumer => consumer.start())
    return
  }

  getHello(): string {
    return 'Hello World!';
  }
}
