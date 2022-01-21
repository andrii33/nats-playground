import { NatsConnection, JsMsg, AckPolicy, nanos } from 'nats'
import { Logger } from '@nestjs/common';
import { ConsumerOptions, StreamName } from './q.types' 

export enum ConsumerStatus {
  ACTIVE = 'active',
  DRY = 'dry',
  EMPTY = 'empty'
}

export type SqsConsumerStatus = {
  statusId: ConsumerStatus
  startTime: number
}

export class Consumer {
  private connection: NatsConnection
  private streamName: StreamName
  private stopped = true
  private handleMessage: (message: JsMsg) => Promise<void>
  private pollTimer: NodeJS.Timer | undefined
  private batchSize: number
  private pollInterval: number
  private retryLimit: number
  private ackWaitSec: number
  private status: SqsConsumerStatus
  private initOptions: ConsumerOptions
  private concurrentConsumersPool: Consumer[]

  constructor(connection: NatsConnection, options: ConsumerOptions) {
    this.connection = connection
    this.handleMessage = options.handleMessage
    this.streamName = options.streamName
    this.initOptions = options
    this.batchSize = options.batchSize ?? 10
    this.pollInterval = (options.pollInterval ?? 30) * 1000
    this.retryLimit = options.retryLimit ?? 5
    this.ackWaitSec = options.ackWaitSec ?? 60
  }

  async init() {
    // add consumer to the stream
    const jetStreamManager = await this.connection.jetstreamManager();
    await jetStreamManager.consumers.add(this.streamName, {
      durable_name: this.streamName,
      ack_policy: AckPolicy.Explicit,
      ack_wait: nanos(this.ackWaitSec * 1000),
      deliver_group: this.streamName
    });
    this.updateStatus()
  }

  static async instance(connection: NatsConnection, options: ConsumerOptions) {
    const consumer = new Consumer(connection, options)
    await consumer.init()
    return consumer
  }

  async addConcurrentConsumer() {
    const consumer = await Consumer.instance(this.connection, this.initOptions)
    consumer.start()
    this.concurrentConsumersPool.push(consumer)
  }

  getConcurrentConsumersCount() {
    return this.concurrentConsumersPool.length
  }

  removeAllConcurrentConsumers() {
    this.concurrentConsumersPool.map(consumer => consumer.stop())
    this.concurrentConsumersPool = []
  }

  removeConcurrentConsumer() {
    const consumer = this.concurrentConsumersPool.pop()
    consumer.stop()
  }

  async processMessagesBatch() {
    const messages = await this.receiveMessages()
    const processRequests = []
    for await (const message of messages) {
      processRequests.push(this.processMessage(message))
    }
    this.updateStatus(processRequests.length)
    return Promise.all(processRequests)
  }

  async processMessage(message: JsMsg) {
    try {
      await this.handleMessage(message)
      message.ack();
    } catch (err) {
      Logger.error(err)
      if (message.info.redeliveryCount >= this.retryLimit) {
        message.term()
      } else {
        message.nak()
      }
    }
  }

  async receiveMessages() {
    return this.connection.jetstream().fetch(this.streamName, this.streamName, { batch: this.batchSize, expires: 5000 })
  }

  private updateStatus(responseMessagesCount?: number) {
    const currentStatus = this.responseToStatus(responseMessagesCount)
    if (currentStatus !== this.status?.statusId) {
      this.status = {statusId: currentStatus, startTime: Date.now()}
    }
  }

  getStatus() { return this.status }

  private responseToStatus(responseMessagesCount?: number) {
    if (!responseMessagesCount || responseMessagesCount === 0) return ConsumerStatus.EMPTY
    if (responseMessagesCount === this.batchSize) return ConsumerStatus.ACTIVE
    if (responseMessagesCount < this.batchSize) return ConsumerStatus.DRY
  }

  start() {
    Logger.log(`start ${this.stopped}`)
    if (!this.stopped) return
    this.stopped = false
    this.updateStatus()
    this.poll()
  }

  stop() {
    Logger.log(`stop ${this.stopped}`)
    this.stopped = true
    this.updateStatus()
    if (this.pollTimer) clearInterval(this.pollTimer)
  }

  private async poll() {
    if (this.stopped) return
    await this.processMessagesBatch()
    setTimeout(this.poll.bind(this), this.status.statusId === ConsumerStatus.EMPTY ? this.pollInterval : 0)
  }
}