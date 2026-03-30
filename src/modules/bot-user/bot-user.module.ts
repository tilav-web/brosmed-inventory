import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotUser } from './entities/bot-user.entity';
import { BotUserService } from './services/bot-user.service';
import { BotUserController } from './controllers/bot-user.controller';
import { User } from '../user/entities/user.entity';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [TypeOrmModule.forFeature([BotUser, User]), forwardRef(() => BotModule)],
  providers: [BotUserService],
  controllers: [BotUserController],
  exports: [BotUserService],
})
export class BotUserModule {}
