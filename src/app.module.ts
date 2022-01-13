import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [{
    provide: 'AppService',
    useFactory: async () => {
      const service = new AppService()
      await service.init()
      return service;
    },
  }],
})
export class AppModule {}
