import { QueueOptions, QueueType } from './q.types';

export class QueueOptionsStorage {
  private static queueOptions: QueueOptions = [];

  public static getQueueOptions(): QueueOptions {
    return this.queueOptions;
  }

  public static addQueueOptions(options: QueueOptions) {
    const queueOptions = options.map((option) => {
      return {
        ...option,
        type: option.type || QueueType.All,
      };
    });
    this.queueOptions.push(...queueOptions);
  }
}
