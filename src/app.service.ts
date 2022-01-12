import { Injectable, Logger } from '@nestjs/common';

import { connect, StringCodec, NatsConnection } from 'nats'
import { Consumer } from './consumer'
import { Producer } from './producer'
export const SUBJECT = 'test'


const streamName1 = 'productRefresh_catalog1'
const streamName2 = 'productRefresh_catalog2'


const subject1 = `${streamName1}.run`
const subject2 = `${streamName2}.run`



@Injectable()
export class AppService {
  private connection: NatsConnection
  private strCodec = StringCodec()
  // streamName1 consumer1
  private consumer1: Consumer
  // streamName1 consumer2
  private consumer2: Consumer
  // streamName2 consumer3
  private consumer3: Consumer
  // streamName1 producer1
  private producer: Producer
  // streamName2 producer2
  private producer2: Producer

  constructor() {
    this.init()
  }

  async init() {
    this.connection = await connect({ servers: 'nats://127.0.0.1:4222' })
    this.consumer1 = await Consumer.instance({
      connection: this.connection,
      streamName: streamName1,
      subject: subject1,
      batchCount: 2,
      handleMessage: async (message) => Logger.log(`### 1${message.info.stream}[${message.seq}] ${this.strCodec.decode(message.data)}`)
    })
    this.consumer2 = await Consumer.instance({
      connection: this.connection,
      streamName: streamName1,
      subject: subject1,
      batchCount: 1,
      handleMessage: async (message) => Logger.log(`@@@ 2${message.info.stream}[${message.seq}] ${this.strCodec.decode(message.data)}`)
    })
    this.producer = await Producer.instance({
      connection: this.connection,
      streamName: streamName1,
      subject: subject1
    })
    this.producer2 = await Producer.instance({
      connection: this.connection,
      streamName: streamName2,
      subject: subject2
    })
    this.consumer3 = await Consumer.instance({
      connection: this.connection,
      streamName: streamName2,
      subject: subject1,
      batchCount: 5,
      handleMessage: async (message) => Logger.log(`!!! 3${message.info.stream}[${message.seq}] ${this.strCodec.decode(message.data)}`)
    })
  }

  async publish(msg: Object) {
    try {
      for (let i = 0; i < 10 ; i++) {
        const data = [...Array(10).keys()].map(k => JSON.stringify({test: k}))
        await this.producer.batchPublish(data)
        await this.producer2.batchPublish(data)
      }
    } catch (err) {
      Logger.log(err)
      Logger.log(err.message)
    }
  }

  async pull() {
    this.consumer1.start()
    this.consumer2.start()
    this.consumer3.start()
    return
  }

  getHello(): string {
    return 'Hello World!';
  }
}
