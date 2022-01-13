import { Injectable } from '@nestjs/common';
import { ConnectionOptions } from 'nats'
@Injectable()
export class QConfig {
  public constructor(public readonly option: ConnectionOptions) {}
}
