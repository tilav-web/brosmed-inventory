import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CategoryModule } from '../category/category.module';
import { ExpenseModule } from '../expense/expense.module';
import { ProductModule } from '../product/product.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { ReportModule } from '../report/report.module';
import { SupplierModule } from '../supplier/supplier.module';
import { UnitModule } from '../unit/unit.module';
import { UserModule } from '../user/user.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SeedModule } from 'src/seed/seed.module';
import { BotModule } from '../bot/bot.module';

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return undefined;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV');
        const isTsRuntime = __filename.endsWith('.ts');
        const fileExtension = isTsRuntime ? 'ts' : 'js';
        const synchronize =
          parseBoolean(configService.get<string>('DB_SYNCHRONIZE')) ??
          nodeEnv === 'development';
        const migrationsRun =
          parseBoolean(configService.get<string>('DB_RUN_MIGRATIONS')) ??
          nodeEnv === 'production';

        return {
          type: 'postgres' as const,
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
          autoLoadEntities: true,
          migrations: [
            join(
              __dirname,
              '..',
              '..',
              'database',
              'migrations',
              `*.${fileExtension}`,
            ),
          ],
          synchronize,
          migrationsRun,
          logging: nodeEnv === 'development' ? ['query', 'error'] : ['error'],
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL', 60_000),
          limit: configService.get<number>('THROTTLE_LIMIT', 60),
        },
      ],
    }),
    ScheduleModule.forRoot(),
    UserModule,
    AuthModule,
    CategoryModule,
    ExpenseModule,
    ProductModule,
    PurchaseOrderModule,
    ReportModule,
    SupplierModule,
    UnitModule,
    WarehouseModule,
    RedisModule,
    SeedModule,
    BotModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
