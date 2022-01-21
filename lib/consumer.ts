import { NatsConnection, JsMsg, JetStreamPullSubscription, AckPolicy, consumerOpts, nanos } from 'nats'
import { Logger } from '@nestjs/common';
import { ConsumerOptions, StreamName, Subject } from './q.types' 

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

  constructor(connection: NatsConnection, options: ConsumerOptions) {
    this.connection = connection
    this.handleMessage = options.handleMessage
    this.streamName = options.streamName
    this.batchSize = options.batchSize ?? 10
    this.pollInterval = options.pollInterval ?? 3
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
    setInterval(() => {
      Logger.log(`STATUS ${this.getStatus().statusId}`)
    }, 2000)
    // const opts = consumerOpts()
    // opts.queue(this.streamName)
    // opts.durable(this.streamName)
    // create pull subscription for the consumer
    // this.subscription = await this.connection.jetstream().pullSubscribe(
    //   this.subject, 
    //   opts
    // )
    // connect message handler
    // this.processMessagesBatch()
  }

  static async instance(connection: NatsConnection, options: ConsumerOptions) {
    const consumer = new Consumer(connection, options)
    await consumer.init()
    return consumer
  }

  async processMessagesBatch() {
    const messages = await this.receiveMessages()
    const processRequests = []
    Logger.log(`P ${messages.getPending()} Pr ${messages.getProcessed()} Rec ${messages.getReceived()}`)
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
    return this.connection.jetstream().fetch(this.streamName, this.streamName, { batch: 10, expires: 5000 })
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
    const pollInterval = this.pollInterval * 1000
    // const expires = pollInterval < 10000 ? pollInterval : 10000
    await this.processMessagesBatch()
    // TODO pollInterval or 0
    setTimeout(this.poll.bind(this), 0)
  }
}