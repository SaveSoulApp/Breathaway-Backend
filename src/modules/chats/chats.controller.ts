import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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

import { ApiStandardErrors, CurrentUserId } from '@common/decorators';
import { JwtAuthGuard } from '@common/guards';
import { SerializeExpose } from '@common/interceptors';
import { BaseController } from '@core/base';
import { LoggerService } from '@core/logger';

import { ChatsService } from './chats.service';
import { CurrentChatRoom } from './decorators';
import {
  ChatMessagesResponseDto,
  ChatRoomKeyResponseDto,
  ChatRoomsResponseDto,
  CreateMessageRequestDto,
  DeleteMessagesRequestDto,
  DeleteMessagesResponseDto,
  GetMessagesRequestDto,
  GetRoomsRequestDto,
  MarkMessageReadRequestDto,
  MarkMessagesReadResponseDto,
  MessageResponseDto,
  SupabaseTokenResponseDto,
} from './dto';
import { ChatRoomParticipantGuard } from './guards';
import type { ChatRoomRecord } from './interfaces';
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
  getSupabaseToken(@CurrentUserId() userId: string) {
    const token = this.supabaseAuthService.generateToken(userId);
    return { token };
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
  ) {
    return this.chatsService.sendMessage(userId, dto);
  }

  @Post(':roomId/messages/read')
  @UseGuards(ChatRoomParticipantGuard)
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
    @CurrentChatRoom() room: ChatRoomRecord,
    @Body() dto: MarkMessageReadRequestDto,
  ) {
    await this.chatsService.markMessageRead(userId, room, dto);
    return { success: true };
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
  ) {
    return this.chatsService.getRooms(userId, query);
  }

  @Get(':roomId/messages')
  @UseGuards(ChatRoomParticipantGuard)
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
    @CurrentChatRoom() room: ChatRoomRecord,
    @Query() query: GetMessagesRequestDto,
  ) {
    return this.chatsService.getMessages(userId, room, query);
  }

  @Get(':roomId/key')
  @UseGuards(ChatRoomParticipantGuard)
  @ApiOperation({
    summary: 'Get unwrapped room encryption key for message decryption',
    description:
      'Returns the raw 32-byte AES-256 room data key (DEK) for authorized participants to decrypt messages in-browser or on mobile clients.',
  })
  @ApiParam({ name: 'roomId', description: 'The unique room UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Room encryption key retrieved successfully',
    type: ChatRoomKeyResponseDto,
  })
  @SerializeExpose(ChatRoomKeyResponseDto)
  async getRoomKey(
    @CurrentUserId() userId: string,
    @CurrentChatRoom() room: ChatRoomRecord,
  ) {
    return this.chatsService.getRoomKey(userId, room);
  }

  @Delete(':roomId/messages')
  @UseGuards(ChatRoomParticipantGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete chat messages (batch or single)',
    description:
      'Deletes one or more messages sent by the calling participant from the specified chat room.',
  })
  @ApiParam({ name: 'roomId', description: 'The unique room UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Messages deleted successfully',
    type: DeleteMessagesResponseDto,
  })
  @SerializeExpose(DeleteMessagesResponseDto)
  async deleteMessages(
    @CurrentUserId() userId: string,
    @CurrentChatRoom() room: ChatRoomRecord,
    @Body() dto: DeleteMessagesRequestDto,
  ) {
    return this.chatsService.deleteMessages(userId, room, dto);
  }

  @Delete(':roomId/messages/:messageId')
  @UseGuards(ChatRoomParticipantGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a single chat message',
    description:
      'Convenience endpoint to delete a single message sent by the calling participant.',
  })
  @ApiParam({ name: 'roomId', description: 'The unique room UUID' })
  @ApiParam({ name: 'messageId', description: 'The unique message UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message deleted successfully',
    type: DeleteMessagesResponseDto,
  })
  @SerializeExpose(DeleteMessagesResponseDto)
  async deleteSingleMessage(
    @CurrentUserId() userId: string,
    @CurrentChatRoom() room: ChatRoomRecord,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
  ) {
    return this.chatsService.deleteMessages(userId, room, {
      messageIds: [messageId],
    });
  }
}
