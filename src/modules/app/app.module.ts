import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CategoryModule } from '../category/category.module';
import { ProductModule } from '../product/product.module';
import { UnitModule } from '../unit/unit.module';
import { UserModule } from '../user/user.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
    UserModule,
    AuthModule,
    CategoryModule,
    ProductModule,
    UnitModule,
    WarehouseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
