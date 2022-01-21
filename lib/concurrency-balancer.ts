import { QConsumerOptions, ConsumerStatus, ConcurrentOptions } from './q.types'
import { AsyncProcessor, ConcurrentConsumer, ConcurrentController } from './q.interfaces'
/**
 *  Concurrent consumers processing balancer
 *  Implements AsyncProcessor and ConcurrentController
 *  Check consumer status with activationIntervalSec
 *  Call addConcurrentConsumers 
 *  Add concurrent consumers in case the consumer status is ACTIVE for more than activationIntervalSec
 *  Add concurrent consumers until concurrentLimit reached
 *  Stop and remove concurrent consumers if status was changed to DRY or EMPTY
 */
export class ConcurrencyBalancer implements AsyncProcessor, ConcurrentController {
  private concurrentLimit: number
  private activationInterval: number
  private stopped: boolean
  private handlers: Map<ConsumerStatus, (consumer: ConcurrentConsumer, activeConsumersCount: number) => void> // {[key: string]: (status: QConsumerStatus) => void}
  private readonly consumers: ConcurrentConsumer[] = []

  constructor(
    private readonly options: ConcurrentOptions
  ) {
    this.init()
  }

  /**
   * Add a consumer to track
   * @param consumer 
   */
  trackConsumer(consumer: ConcurrentConsumer) {
    this.consumers.push(consumer)
  }

  /**
   * Create consumer instance
   * @param consumerOptions 
   * @returns 
   */
  public static instance(consumerOptions: QConsumerOptions) {
    return new ConcurrencyBalancer(consumerOptions)
  }
  
  /**
   * Initialize consumer
   * @returns 
   */
  private init() {
    if (!this.options?.concurrentLimit) return
    this.concurrentLimit = this.options.concurrentLimit
    this.activationInterval = (this.options.activationIntervalSec ?? 10) * 1000 
    this.stopped = true
    this.handlers = new Map([
      [ConsumerStatus.ACTIVE, this.handleActive.bind(this)],
      [ConsumerStatus.EMPTY, this.handleEmpty.bind(this)],
      [ConsumerStatus.DRY, this.handleDry.bind(this)],
    ])
  }

  /**
   * Run balancer process
   * @returns 
   */
  start() {
    if (!this.stopped || !this.concurrentLimit) return
    this.stopped = false
    this.balancer()
  }

  /**
   * Stop balancer process
   */
  stop() {
    this.stopped = true
  }

  /**
   * Track consumers' statuses and update concurrency according
   * @returns 
   */
  private balancer() {
    if (this.stopped) return
    const activeConsumersCount = this.getActiveConsumersCount()
    this.consumers.map(consumer => {
      this.handlers.get(consumer.getStatus().statusId)(consumer, activeConsumersCount)
    })
    setTimeout(this.balancer.bind(this), this.activationInterval)
  }

  /**
   * @returns 
   */
  private getActiveConsumersCount() {
    return this.consumers.reduce((count, consumer) => {
      if (consumer.getStatus().statusId !== ConsumerStatus.ACTIVE) return count
      if ((Date.now() - this.activationInterval) < consumer.getStatus().startTime) return count
      count++
      return count
    }, 0)
  }

  /**
   * @param consumer 
   * @param activeConsumersCount 
   * @returns 
   */
  private handleActive(consumer: ConcurrentConsumer, activeConsumersCount: number) {
    if ((Date.now() - this.activationInterval) < consumer.getStatus().startTime) return
    this.updateConcurrentConsumers(consumer, activeConsumersCount)
  }

  /**
   * @param consumer 
   * @param activeConsumersCount 
   * @returns 
   */
  private handleEmpty(consumer: ConcurrentConsumer, activeConsumersCount: number) {
    if (consumer.getConcurrentConsumersCount() <= 0) return
    if ((Date.now() - this.activationInterval) < consumer.getStatus().startTime) return
    consumer.removeAllConcurrentConsumers()
  }

  /**
   * @param consumer 
   * @param activeConsumersCount 
   * @returns 
   */
  private handleDry(consumer: ConcurrentConsumer, activeConsumersCount: number) {
    if ((Date.now() - this.activationInterval) < consumer.getStatus().startTime) return
    if (consumer.getConcurrentConsumersCount() <= 0) return
    consumer.removeConcurrentConsumer()
  }

  /**
   * @param consumer 
   * @param activeConsumersCount 
   */
  private updateConcurrentConsumers(consumer: ConcurrentConsumer, activeConsumersCount: number) {
    const concurrentLimit = Math.ceil(this.concurrentLimit / activeConsumersCount)
    if (consumer.getConcurrentConsumersCount() > concurrentLimit) {
      this.removeConsumers(consumer, consumer.getConcurrentConsumersCount() - concurrentLimit)
    } else if (consumer.getConcurrentConsumersCount() < concurrentLimit) {
      this.addConsumers(consumer, concurrentLimit - consumer.getConcurrentConsumersCount())
    }
  }

  /**
   * @param consumer 
   * @param count 
   */
  private addConsumers(consumer: ConcurrentConsumer, count: number) {
    while (--count >= 0) {
      consumer.addConcurrentConsumer()
    }
  }

  /**
   * @param consumer 
   * @param count 
   */
  private removeConsumers(consumer: ConcurrentConsumer, count: number) {
    while (--count >= 0) {
      consumer.removeConcurrentConsumer()
    }
  }
}