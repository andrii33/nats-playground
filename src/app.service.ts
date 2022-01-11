import { Injectable, Logger } from '@nestjs/common';

import { connect, StringCodec, NatsConnection, PubAck, Empty, AckPolicy } from 'nats'

export const SUBJECT = 'test'


const streamName = 'testStream'

const durableNameB = 'durableNameB'
const durableNameC = 'durableNameC'

const subject = `${streamName}.a`


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
   

    const nc = this.connection
    const jsm = await nc.jetstreamManager();
    // await jsm.streams.delete('testName')
    await jsm.streams.add({ name: streamName, subjects: [`${streamName}.*`] });

    const streams  = await jsm.streams.list().next()
    streams.forEach((stream) => {
      Logger.log(stream)
    })

    const js = nc.jetstream();

    await js.publish(subject, this.strCodec.encode(JSON.stringify({test: '3'})))

    

    // To start receiving messages you pull the subscription
    // setInterval(() => {
    //   psub.pull({ batch: 10, expires: 10000 });
    // }, 10000);

    // add a new durable pull consumer
    // await jsm.consumers.add(streamName, {
    //   durable_name: durableNameC,
    //   ack_policy: AckPolicy.Explicit,
    //   qu: 'a.c'
    // });
    

    // retrieve a consumer's configuration
    // const ci = await jsm.consumers.info('a', durableNameB);
    // Logger.log(ci);

    // await jsm.streams.add({ name: "a", subjects: ["a.*"] });
    // const streams = await jsm.streams.list().next();
    // streams.forEach(c => Logger.log(JSON.stringify(c)))
    // // create a jetstream client:
   
    // await js.publish("a.c", this.strCodec.encode(JSON.stringify({test: '3'})))
    // await js.publish("a.c", this.strCodec.encode(JSON.stringify({test: '4'})))

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


    // let resMsg = await js.pull('a', durableNameC);
    // Logger.log(this.strCodec.decode(resMsg.data))
    // Logger.log(resMsg.subject)
    // Logger.log(resMsg.info)
    // Logger.log(resMsg.sid)
    // resMsg.ack();
  }

  async pull() {
    const nc = this.connection
    const jsm = await nc.jetstreamManager();
    const js = nc.jetstream();
    await jsm.consumers.add(streamName, {
      durable_name: durableNameB,
      ack_policy: AckPolicy.Explicit
    });

    let res = await js.pull(streamName, durableNameB);
    Logger.log(this.strCodec.decode(res.data))
    res.ack();

    const psub = await js.pullSubscribe(subject, { config: { durable_name: "c" } });
      // unsubscribe after 5 messages
    psub.unsubscribe(5);

    const done = (async () => {
      for await (const m of psub) {
        Logger.log(`${m.info.stream}[${m.seq}]`);
        m.ack();
      }
    })();
  
    psub.pull({ batch: 5, expires: 10000 });

    // To start receiving messages you pull the subscription
    // setInterval(() => {
      
    // }, 1000)

    // const psub = await js.pullSubscribe(subj, { config: { durable_name: durableNameB },  queue: queueNameB });
    // for await (const m of psub) {
    //   Logger.log(`${m.info.stream}[${m.seq}]`);
    //   m.ack();
    // }
   
    // psub.pull({ batch: 10, expires: 10000 });
    // psub.unsubscribe();
    // Logger.log('pulling')
    // const subscription = this.connection.subscribe(SUBJECT)
    // for await (const m of subscription) {
    //   Logger.log(`[${subscription.getProcessed()}]: ${this.strCodec.decode(m.data)}`);
    // }
    // await subscription.drain()
    // Logger.log('subscription closed');
  }

  getHello(): string {
    return 'Hello World!';
  }
}
