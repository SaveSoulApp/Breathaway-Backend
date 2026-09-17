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
import { plainToInstance } from 'class-transformer';

import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import { ChatsService } from './chats.service';
import {
  ChatMessagesResponseDto,
  ChatRoomsResponseDto,
  CreateMessageRequestDto,
  GetMessagesRequestDto,
  GetRoomsRequestDto,
  MarkMessageReadRequestDto,
  MarkMessagesReadResponseDto,
  MessageResponseDto,
  SupabaseTokenResponseDto,
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
    type: SupabaseTokenResponseDto,
  })
  @SerializeExpose(SupabaseTokenResponseDto)
  getSupabaseToken(@CurrentUserId() userId: string): SupabaseTokenResponseDto {
    const token = this.supabaseAuthService.generateToken(userId);
    return plainToInstance(
      SupabaseTokenResponseDto,
      { token },
      { excludeExtraneousValues: true },
    );
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a new chat message' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Message sent successfully',
    type: MessageResponseDto,
  })
  @SerializeExpose(MessageResponseDto)
  async sendMessage(
    @CurrentUserId() userId: string,
    @Body() dto: CreateMessageRequestDto,
  ): Promise<MessageResponseDto> {
    const message = await this.chatsService.sendMessage(userId, dto);
    return plainToInstance(MessageResponseDto, message, {
      excludeExtraneousValues: true,
    });
  }

  @Post(':roomId/messages/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark messages as read' })
  @ApiParam({ name: 'roomId', description: 'The unique room UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Messages marked as read',
    type: MarkMessagesReadResponseDto,
  })
  @SerializeExpose(MarkMessagesReadResponseDto)
  async markMessagesRead(
    @CurrentUserId() userId: string,
    @Param('roomId') roomId: string,
    @Body() dto: MarkMessageReadRequestDto,
  ): Promise<MarkMessagesReadResponseDto> {
    await this.chatsService.markMessageRead(userId, roomId, dto);
    return plainToInstance(
      MarkMessagesReadResponseDto,
      { success: true },
      { excludeExtraneousValues: true },
    );
  }

  @Get('rooms')
  @ApiOperation({ summary: 'Get active chat rooms for the current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chat rooms retrieved successfully',
    type: ChatRoomsResponseDto,
  })
  @SerializeExpose(ChatRoomsResponseDto)
  async getRooms(
    @CurrentUserId() userId: string,
    @Query() query: GetRoomsRequestDto,
  ): Promise<ChatRoomsResponseDto> {
    const result = await this.chatsService.getRooms(userId, query);
    return plainToInstance(ChatRoomsResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':roomId/messages')
  @ApiOperation({ summary: 'Get chat messages with cursor pagination' })
  @ApiParam({ name: 'roomId', description: 'The unique room UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Messages retrieved successfully',
    type: ChatMessagesResponseDto,
  })
  @SerializeExpose(ChatMessagesResponseDto)
  async getMessages(
    @CurrentUserId() userId: string,
    @Param('roomId') roomId: string,
    @Query() query: GetMessagesRequestDto,
  ): Promise<ChatMessagesResponseDto> {
    const result = await this.chatsService.getMessages(userId, roomId, query);
    return plainToInstance(ChatMessagesResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }
}
