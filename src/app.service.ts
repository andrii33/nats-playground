import { Injectable, Logger } from '@nestjs/common';

import { connect, StringCodec, NatsConnection, PubAck, Empty, AckPolicy } from 'nats'

export const SUBJECT = 'test'

@Injectable()
export class AppService {
  private connection: NatsConnection
  private strCodec = StringCodec()

  constructor() {
    this.init()
  }

  async init() {
    this.connection = await connect({ servers: 'nats://127.0.0.1:4222' })
  }

  async publish(msg: Object) {
    // await this.connection.jetstream().publish(SUBJECT, this.strCodec.encode(JSON.stringify({test: 'stream'})))
    // const Empty = this.strCodec.encode(JSON.stringify({test: 'stream'}))
    const durableName = 'durableN'

    const nc = this.connection
    const jsm = await nc.jetstreamManager();

    // add a new durable pull consumer
    await jsm.consumers.add('a', {
      durable_name: durableName,
      ack_policy: AckPolicy.Explicit,
    });
    

    // retrieve a consumer's configuration
    const ci = await jsm.consumers.info('a', durableName);
    Logger.log(ci);

    // await jsm.streams.add({ name: "a", subjects: ["a.*"] });
    // const streams = await jsm.streams.list().next();
    // streams.forEach(c => Logger.log(JSON.stringify(c)))
    // // create a jetstream client:
    const js = nc.jetstream();
    await js.publish("a.b", this.strCodec.encode(JSON.stringify({test: '2'})))

    // // To get multiple messages in one request you can:
    // let msgs = await js.fetch("a", durableName, { batch: 10, expires: 5000 });
    // the request returns an iterator that will get at most 10 seconds or wait
    // for 5000ms for messages to arrive.

    // const done = (async () => {
    //   for await (const m of msgs) {
    //     // do something with the message
    //     // and if the consumer is not set to auto-ack, ack!
    //     m.ack();
    //     Logger.log(m.seq)
    //     Logger.log(this.strCodec.decode(m.data))
    //   }
    // })();
    // // The iterator completed
    // await done


    let resMsg = await js.pull('a', durableName);
    Logger.log(this.strCodec.decode(resMsg.data))
    Logger.log(resMsg.subject)
    Logger.log(resMsg.info)
    Logger.log(resMsg.sid)
    resMsg.ack();
  }

  async pull() {
    // Logger.log('pulling')
    // const subscription = this.connection.subscribe(SUBJECT)
    // for await (const m of subscription) {
    //   Logger.log(`[${subscription.getProcessed()}]: ${this.strCodec.decode(m.data)}`);
    // }
    // await subscription.drain()
    // Logger.log('subscription closed');

    const msg = await this.connection.jetstream().pull(SUBJECT, 'test')
    Logger.log(JSON.stringify(msg))
  }

  getHello(): string {
    return 'Hello World!';
  }
}
