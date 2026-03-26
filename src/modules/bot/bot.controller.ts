import { Controller, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { BotService } from './bot.service';

@Controller('bot')
@ApiTags('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Telegram bot webhook endpoint' })
  @ApiOkResponse({ description: 'Webhook qabul qilindi' })
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const callback = this.botService.webhookCallback;
    if (!callback) {
      return res.status(503).json({
        message:
          'Webhook hali ishga tushmagan. BOT_MODE=webhook qilib ishga tushiring.',
      });
    }

    await callback(req, res);
  }
}
