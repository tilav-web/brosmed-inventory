import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotUser } from './entities/bot-user.entity';
import { BotUserService } from './services/bot-user.service';
import { BotUserController } from './controllers/bot-user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BotUser])],
  providers: [BotUserService],
  controllers: [BotUserController],
  exports: [BotUserService],
})
export class BotUserModule {}
