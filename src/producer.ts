import { NatsConnection, StringCodec, PubAck } from 'nats'
import { Injectable, Logger } from '@nestjs/common';

export type ProducerOptions = {
  streamName: string,
  subject: string
}

export class Producer {
  private connection: NatsConnection
  private streamName: string
  private subject: string
  private strCodec = StringCodec()

  constructor(connection: NatsConnection, options: ProducerOptions) {
    this.connection = connection
    this.streamName = options.streamName
    this.subject = options.subject
  }

  static async instance(connection: NatsConnection, options: ProducerOptions) {
    const producer = new Producer(connection, options)
    Logger.log('init producer')
    await producer.init()
    return producer
  }

  async init() {
    const jestStreamManager = await this.connection.jetstreamManager();
    await jestStreamManager.streams.add({ name: this.streamName, subjects: [`${this.streamName}.*`] });
  }

  async publish(data: string) {
    return this.connection.jetstream().publish(this.subject, this.strCodec.encode(data))
  }

  async batchPublish(data: string[]) {
    const pubPromises: Promise<PubAck>[] = []
    for (const msg of data) {
      pubPromises.push(this.publish(msg))
    }
    await Promise.all(pubPromises)
  }
}