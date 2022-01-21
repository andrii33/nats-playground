import { Consumer, ConsumerOptions, ConsumerStatus } from '.'
/**
 *  Concurrent consumers processing balancer
 *  Check consumer status with activationIntervalSec
 *  Call addConcurrentConsumers 
 *  Add concurrent consumers in case the consumer status is ACTIVE for more than activationIntervalSec
 *  Add concurrent consumers until concurrentLimit reached
 *  Stop and remove concurrent consumers if status was changed to DRY or EMPTY
 */
export class ConcurrencyBalancer {
  private concurrentConsumersLimit: number
  private activationInterval: number
  private stopped: boolean
  private handlers: Map<ConsumerStatus, (consumer: Consumer, activeConsumersCount: number) => void> // {[key: string]: (status: SqsConsumerStatus) => void}
  private readonly consumers: Consumer[] = []

  constructor(
    private readonly consumerOptions: ConsumerOptions
  ) {
    this.init()
  }

  /**
   * Add a consumer to track
   * @param consumer 
   */
  trackConsumer(consumer: Consumer) {
    this.consumers.push(consumer)
  }

  /**
   * Create consumer instance
   * @param consumerOptions 
   * @returns 
   */
  public static instance(consumerOptions: ConsumerOptions) {
    return new ConcurrencyBalancer(consumerOptions)
  }
  
  /**
   * Initialize consumer
   * @returns 
   */
  private init() {
    if (!this.consumerOptions?.concurrentLimit) return
    this.concurrentConsumersLimit = this.consumerOptions.concurrentLimit
    this.activationInterval = (this.consumerOptions.activationIntervalSec ?? 10) * 1000 
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
    if (!this.stopped || !this.concurrentConsumersLimit) return
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
  private handleActive(consumer: Consumer, activeConsumersCount: number) {
    if ((Date.now() - this.activationInterval) < consumer.getStatus().startTime) return
    this.updateConcurrentConsumers(consumer, activeConsumersCount)
  }

  /**
   * @param consumer 
   * @param activeConsumersCount 
   * @returns 
   */
  private handleEmpty(consumer: Consumer, activeConsumersCount: number) {
    if (consumer.getConcurrentConsumersCount() <= 0) return
    if ((Date.now() - this.activationInterval) < consumer.getStatus().startTime) return
    consumer.removeAllConcurrentConsumers()
  }

  /**
   * @param consumer 
   * @param activeConsumersCount 
   * @returns 
   */
  private handleDry(consumer: Consumer, activeConsumersCount: number) {
    if ((Date.now() - this.activationInterval) < consumer.getStatus().startTime) return
    if (consumer.getConcurrentConsumersCount() <= 0) return
    consumer.removeConcurrentConsumer()
  }

  /**
   * @param consumer 
   * @param activeConsumersCount 
   */
  private updateConcurrentConsumers(consumer: Consumer, activeConsumersCount: number) {
    const concurrentLimit = Math.ceil(this.concurrentConsumersLimit / activeConsumersCount)
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
  private addConsumers(consumer: Consumer, count: number) {
    while (--count >= 0) {
      consumer.addConcurrentConsumer()
    }
  }

  /**
   * @param consumer 
   * @param count 
   */
  private removeConsumers(consumer: Consumer, count: number) {
    while (--count >= 0) {
      consumer.removeConcurrentConsumer()
    }
  }
}