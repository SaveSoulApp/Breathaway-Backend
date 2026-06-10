import { CurrentUserId, ApiStandardErrors } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ChatsService } from './chats.service';
import {
  CreateMessageRequestDto,
  GetMessagesRequestDto,
  MarkMessageReadRequestDto,
} from './dto';
import { SupabaseAuthService } from './services/supabase-auth.service';

@ApiTags('Chats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiStandardErrors()
@Controller({
  path: 'chats',
  version: ['1'],
})
export class ChatsController extends BaseController {
  constructor(
    logger: LoggerService,
    private readonly chatsService: ChatsService,
    private readonly supabaseAuthService: SupabaseAuthService,
  ) {
    super(logger);
  }

  @Get('supabase-token')
  @ApiOperation({ summary: 'Get Supabase Realtime JWT' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'JWT retrieved successfully',
  })
  getSupabaseToken(@CurrentUserId() userId: string) {
    const token = this.supabaseAuthService.generateToken(userId);
    return { token };
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a new chat message' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Message sent successfully',
  })
  async sendMessage(
    @CurrentUserId() userId: string,
    @Body() dto: CreateMessageRequestDto,
  ) {
    const message = await this.chatsService.sendMessage(userId, dto);
    return message;
  }

  @Post(':roomId/messages/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark messages as read' })
  @ApiParam({ name: 'roomId', description: 'The unique room UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Messages marked as read',
  })
  async markMessagesRead(
    @CurrentUserId() userId: string,
    @Param('roomId') roomId: string,
    @Body() dto: MarkMessageReadRequestDto,
  ) {
    await this.chatsService.markMessageRead(userId, roomId, dto);
    return { success: true };
  }

  @Get(':roomId/messages')
  @ApiOperation({ summary: 'Get chat messages with cursor pagination' })
  @ApiParam({ name: 'roomId', description: 'The unique room UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Messages retrieved successfully',
  })
  async getMessages(
    @CurrentUserId() userId: string,
    @Param('roomId') roomId: string,
    @Query() query: GetMessagesRequestDto,
  ) {
    return this.chatsService.getMessages(userId, roomId, query);
  }
}
