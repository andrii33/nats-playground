import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs-plus/discovery';

import { QConfig } from './q.config';
import { QService } from './q.service';
import { QAsyncConfig } from './q.interfaces';
import { QueueOptions } from './q.types';
import { QMetadataScanner } from './q.metadata.scanner';
import { QueueOptionsStorage } from './queue.options.storage';

@Global()
@Module({})
export class QModule {
  public static forRootAsync(asyncQConfig: QAsyncConfig): DynamicModule {
    const imports = this.getUniqImports([asyncQConfig]);

    const qMetadatScanner: Provider = {
      provide: QMetadataScanner,
      useFactory: (discover: DiscoveryService) => {
        return new QMetadataScanner(discover);
      },
      inject: [DiscoveryService],
    };

    const ConfigProvider: Provider = {
      provide: QConfig,
      useFactory: asyncQConfig.useFactory,
      inject: asyncQConfig.inject || [],
    };

    return {
      global: true,
      module: QModule,
      imports: [...imports, DiscoveryModule],
      providers: [qMetadatScanner, ConfigProvider],
      exports: [qMetadatScanner, ConfigProvider],
    };
  }

  public static registerQueue(...options: QueueOptions) {
    QueueOptionsStorage.addQueueOptions([].concat(options));
    const qService: Provider = {
      provide: QService,
      useFactory: async (scanner: QMetadataScanner, qConfig: QConfig) => {
        return new QService(qConfig, scanner);
      },
      inject: [QMetadataScanner, QConfig],
    };

    return {
      global: true,
      module: QModule,
      providers: [qService],
      exports: [qService],
    };
  }

  private static getUniqImports(options: Array<QAsyncConfig>) {
    return (
      options
        .map((option) => option.imports)
        .reduce((acc, i) => acc.concat(i || []), [])
        .filter((v, i, a) => a.indexOf(v) === i) || []
    );
  }
}
