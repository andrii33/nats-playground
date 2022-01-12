import { NatsConnection, JsMsg, JetStreamPullSubscription, AckPolicy } from 'nats'
import { Logger } from '@nestjs/common';

export type StreamName = string
export type Subject = string

export type ConsumerOptions = {
  connection: NatsConnection
  streamName: StreamName,
  subject: Subject,
  handleMessage: (message: JsMsg) => Promise<void>
  batchCount?: number,
  pollInterval?: number,
  retryLimit?: number,
}

export class Consumer {
  private connection: NatsConnection
  private streamName: StreamName
  private subject: Subject
  private stopped: boolean = true
  private subscription: JetStreamPullSubscription
  private handleMessage: (message: JsMsg) => Promise<void>
  private pollTimer: NodeJS.Timer
  private batchCount = 10
  private pollInterval = 3
  private retryLimit = 5

  constructor(options: ConsumerOptions) {
    this.connection = options.connection
    this.handleMessage = options.handleMessage
    this.streamName = options.streamName
    this.subject = options.subject
    this.batchCount = options.batchCount ?? 10
    this.pollInterval = options.pollInterval ?? 3
    this.retryLimit = options.retryLimit ?? 5
  }

  async init() {
    // add consumer to the stream
    const jetStreamManager = await this.connection.jetstreamManager();
    await jetStreamManager.consumers.add(this.streamName, {
      durable_name: this.streamName,
      ack_policy: AckPolicy.Explicit
    });
    // create pull subscription for the consumer
    this.subscription = await this.connection.jetstream().pullSubscribe(
      this.subject, 
      { config: { durable_name: this.streamName }, queue: this.streamName }
    )
    // connect message handler
    this.processMessages()
  }

  static async instance(options: ConsumerOptions) {
    const consumer = new Consumer(options)
    await consumer.init()
    return consumer
  }

  async processMessages() {
    let count = 0
    for await (const message of this.subscription) {
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
      count++
      // pull for new messages once handled
      if (count >= this.batchCount) {
        count = 0
        this.subscription.pull({ batch: this.batchCount, expires: 1000 })
      }
    }
  }

  start() {
    Logger.log(`start ${this.stopped}`)
    if (!this.stopped) return
    this.stopped = false
    this.poll()
  }

  stop() {
    Logger.log(`stop ${this.stopped}`)
    this.stopped = true
    clearInterval(this.pollTimer)
  }

  private async poll() {
    if (this.stopped) return
    const pollInterval = this.pollInterval * 1000
    const expires = pollInterval < 10000 ? pollInterval : 10000
    // start pull
    this.subscription.pull({ batch: this.batchCount, expires })
    Logger.log(`poll ${pollInterval} interval`)
    // check for new messages within pollInterval
    this.pollTimer = setInterval(() => {
      this.subscription.pull({ batch: this.batchCount, expires })
    }, pollInterval)
  }
}