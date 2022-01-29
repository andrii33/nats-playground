import { Injectable } from '@nestjs/common';
import { ConnectionOptions, NatsConnection } from 'nats'
@Injectable()
export class QConfig {
  public constructor(public readonly option: ConnectionOptions, public readonly connection?: NatsConnection) {}
}
