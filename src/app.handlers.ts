import { JsMsg, StringCodec } from 'nats'
import { QProcess, QMessageHandler, QConsumerEventHandler } from '../lib'
import { TestQueue } from './app.module'

const stringCodec = StringCodec()
let counter = 0

@QProcess('stream')
export class AppMessageHandler {
  @QMessageHandler(true)
  public async handleMessage(message: JsMsg) {
    counter += 1
    console.log(`=======${stringCodec.decode(message.data)} ${counter}`)
  }
}

// let counter2 = 0
// @SqsProcess(namePrefix2)
// export class AppMessageHandler2 {
//   @SqsMessageHandler(true)
//   public async handleMessage(messages: AWS.SQS.Message[]) {
//     counter2 += messages.length
//     console.log(`++++++++${namePrefix2} ${counter2}`)
//   }

//   @SqsConsumerEventHandler(SqsConsumerEvent.ERROR)
//   public onProcessingError(error: Error, message: AWS.SQS.Message) {
//     console.log(JSON.stringify(message)) 
//     console.log(error)
//   }
   
//   @SqsConsumerEventHandler(SqsConsumerEvent.PROCESSING_ERROR)
//   public onError(error: Error, message: AWS.SQS.Message) {
//     console.log(JSON.stringify(message)) 
//     console.log(error)
//   }
// }