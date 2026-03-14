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
import { SupplierModule } from '../supplier/supplier.module';
import { UnitModule } from '../unit/unit.module';
import { UserModule } from '../user/user.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SeedModule } from 'src/seed/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: process.env.NODE_ENV === 'development',
        logging:
          process.env.NODE_ENV === 'development'
            ? ['query', 'error']
            : ['error'],
      }),
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
    SupplierModule,
    UnitModule,
    WarehouseModule,
    SeedModule,
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
