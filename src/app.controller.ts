import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('start')
  async getStart(): Promise<void> {
    return this.appService.start();
  }

  @Get('stop')
  getStop(): void {
    return this.appService.stop();
  }

  @Get()
  getHello() {
    return this.appService.getHello();
  }

  @Get('publish')
  async publishMessage() {
    return this.appService.publish({test: 1});
  }

  @Get('pull')
  async pullMessage() {
    return this.appService.pull();
  }
}
