import { NatsConnection, StringCodec, PubAck } from 'nats'

export type ProducerOptions = {
  connection: NatsConnection,
  streamName: string,
  subject: string
}

export class Producer {
  private connection: NatsConnection
  private streamName: string
  private subject: string
  private strCodec = StringCodec()

  constructor(options: ProducerOptions) {
    this.connection = options.connection
    this.streamName = options.streamName
    this.subject = options.subject
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