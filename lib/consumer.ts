import { NatsConnection, JsMsg, AckPolicy, nanos } from 'nats'
import { Logger } from '@nestjs/common';
import { ConsumerOptions, StreamName, ConsumerStatus, QConsumerStatus } from './q.types'
import { ConcurrentConsumer, AsyncProcessor } from './q.interfaces'

/**
 * NATS Stream Consumer
 * 
 * Implements AsyncProcessor and ConcurrentConsumer interfaces
 * Adds durable NATS stream consumer
 * Consumes messages from Nats stream in queue mode
 */
export class Consumer implements AsyncProcessor, ConcurrentConsumer {
  private connection: NatsConnection
  private streamName: StreamName
  private stopped = true
  private handleMessage: (message: JsMsg) => Promise<void>
  private pollTimer: NodeJS.Timer | undefined
  private batchSize: number
  private pollInterval: number
  private retryLimit: number
  private ackWaitSec: number
  private status: QConsumerStatus
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

  /**
   * Initialize consumer
   */
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

  /**
   * @param connection 
   * @param options 
   * @returns 
   */
  static async instance(connection: NatsConnection, options: ConsumerOptions) {
    const consumer = new Consumer(connection, options)
    await consumer.init()
    return consumer
  }

   /**
   * Run consumer process
   * @returns 
   */
  start() {
    Logger.log(`start ${this.stopped}`)
    if (!this.stopped) return
    this.stopped = false
    this.updateStatus()
    this.poll()
  }

  /**
   * Stop consumer process
   */
  stop() {
    Logger.log(`stop ${this.stopped}`)
    this.stopped = true
    this.updateStatus()
    if (this.pollTimer) clearInterval(this.pollTimer)
  }

  /**
   * Fetch and process messages
   * @returns 
   */
  private async poll() {
    if (this.stopped) return
    await this.processMessagesBatch()
    setTimeout(this.poll.bind(this), this.status.statusId === ConsumerStatus.EMPTY ? this.pollInterval : 0)
  }

  /**
   * 
   * @returns 
   */
  async processMessagesBatch() {
    const messages = await this.receiveMessages()
    const processRequests = []
    for await (const message of messages) {
      processRequests.push(this.processMessage(message))
    }
    this.updateStatus(processRequests.length)
    return Promise.all(processRequests)
  }

  /**
   * 
   * @param message 
   */
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

  /**
   * @returns 
   */
  getInitOptions() { return this,this.initOptions }

  /**
   * Fetch messages from Stream
   * @returns 
   */
  async receiveMessages() {
    return this.connection.jetstream().fetch(this.streamName, this.streamName, { batch: this.batchSize, expires: 5000 })
  }

  /**
   * Update consumer processing status
   * @param responseMessagesCount 
   */
  private updateStatus(responseMessagesCount?: number) {
    const currentStatus = this.responseToStatus(responseMessagesCount)
    if (currentStatus !== this.status?.statusId) {
      this.status = {statusId: currentStatus, startTime: Date.now()}
    }
  }

  /**
   * @returns 
   */
  getStatus() { return this.status }

  /**
   * @param responseMessagesCount 
   * @returns 
   */
  private responseToStatus(responseMessagesCount?: number) {
    if (!responseMessagesCount || responseMessagesCount === 0) return ConsumerStatus.EMPTY
    if (responseMessagesCount === this.batchSize) return ConsumerStatus.ACTIVE
    if (responseMessagesCount < this.batchSize) return ConsumerStatus.DRY
  }

  /**
   * add internal consumer
   */
  async addConcurrentConsumer() {
    const consumer = await Consumer.instance(this.connection, this.initOptions)
    consumer.start()
    this.concurrentConsumersPool.push(consumer)
  }

  /**
   * count internal consumers
   */
  getConcurrentConsumersCount() {
    return this.concurrentConsumersPool.length
  }

  /**
   * remove all internal consumers
   */
  removeAllConcurrentConsumers() {
    this.concurrentConsumersPool.map(consumer => consumer.stop())
    this.concurrentConsumersPool = []
  }

  /**
   * remove one internal consumers
   */
  removeConcurrentConsumer() {
    const consumer = this.concurrentConsumersPool.pop()
    consumer.stop()
  }
}