import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery,
  ApiOkResponse, ApiNoContentResponse, ApiResponse, ApiProduces,
} from '@nestjs/swagger';
import { ApiStandardResponses } from '../../common/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard } from '../../common/guards/casl.guard';
import { ManageKnowledgeBaseHandler } from '../../modules/ai/manage-knowledge-base/manage-knowledge-base.handler';
import {
  ListDocumentsDto,
  UpdateDocumentDto,
} from '../../modules/ai/manage-knowledge-base/manage-knowledge-base.dto';
import { ChatCompletionHandler } from '../../modules/ai/chat-completion/chat-completion.handler';
import { ChatCompletionDto } from '../../modules/ai/chat-completion/chat-completion.dto';
import { GetChatbotConfigHandler } from '../../modules/ai/chatbot-config/get-chatbot-config.handler';
import { UpsertChatbotConfigHandler } from '../../modules/ai/chatbot-config/upsert-chatbot-config.handler';
import { UpsertChatbotConfigDto } from '../../modules/ai/chatbot-config/upsert-chatbot-config.dto';
import { RequireFeature } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';

@ApiTags('Dashboard / AI')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('dashboard/ai')
@UseGuards(JwtGuard, CaslGuard)
export class DashboardAiController {
  constructor(
    private readonly knowledgeBase: ManageKnowledgeBaseHandler,
    private readonly chatCompletion: ChatCompletionHandler,
    private readonly getChatbotConfig: GetChatbotConfigHandler,
    private readonly upsertChatbotConfig: UpsertChatbotConfigHandler,
  ) {}

  // ── Knowledge Base ─────────────────────────────────────────────────────────

  @RequireFeature(FeatureKey.AI_CHATBOT)
  @Get('knowledge-base')
  @ApiOperation({ summary: 'List knowledge-base documents' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by document status', example: 'ACTIVE' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page', example: 20 })
  @ApiOkResponse({
    description: 'Paginated list of knowledge-base documents',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, status: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } } } },
        total: { type: 'number' },
        page: { type: 'number' },
        totalPages: { type: 'number' },
      },
    },
  })
  listDocuments(@Query() query: ListDocumentsDto) {
    return this.knowledgeBase.listDocuments(query);
  }

  @RequireFeature(FeatureKey.AI_CHATBOT)
  @Get('knowledge-base/:id')
  @ApiOperation({ summary: 'Get a knowledge-base document by ID' })
  @ApiParam({ name: 'id', description: 'Document UUID', example: '00000000-0000-0000-0000-000000000001' })
  @ApiOkResponse({ description: 'Document detail', schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, content: { type: 'string' }, status: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } } } })
  @ApiResponse({ status: 404, description: 'Document not found' })
  getDocument(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledgeBase.getDocument({ documentId: id });
  }

  @RequireFeature(FeatureKey.AI_CHATBOT)
  @Patch('knowledge-base/:id')
  @ApiOperation({ summary: 'Update a knowledge-base document' })
  @ApiParam({ name: 'id', description: 'Document UUID', example: '00000000-0000-0000-0000-000000000001' })
  @ApiOkResponse({ description: 'Updated document', schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, status: { type: 'string' }, updatedAt: { type: 'string', format: 'date-time' } } } })
  @ApiResponse({ status: 404, description: 'Document not found' })
  updateDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDocumentDto,
  ) {
    return this.knowledgeBase.updateDocument({ documentId: id, ...body });
  }

  @RequireFeature(FeatureKey.AI_CHATBOT)
  @Delete('knowledge-base/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a knowledge-base document' })
  @ApiParam({ name: 'id', description: 'Document UUID', example: '00000000-0000-0000-0000-000000000001' })
  @ApiNoContentResponse({ description: 'Document deleted' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  deleteDocument(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledgeBase.deleteDocument({ documentId: id });
  }

  // ── Chatbot Config ────────────────────────────────────────────────────────

  @RequireFeature(FeatureKey.AI_CHATBOT)
  @Get('chatbot-config')
  @ApiOperation({ summary: 'Get chatbot configuration (org-unique singleton)' })
  @ApiOkResponse({
    description: 'Chatbot configuration for the current org (created on first read)',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        isEnabled: { type: 'boolean' },
        welcomeMessage: { type: 'string', nullable: true },
        model: { type: 'string', nullable: true },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  getChatbotConfigEndpoint() {
    return this.getChatbotConfig.execute();
  }

  @RequireFeature(FeatureKey.AI_CHATBOT)
  @Patch('chatbot-config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert chatbot configuration (org-unique singleton)' })
  @ApiOkResponse({ description: 'Updated chatbot configuration', schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, isEnabled: { type: 'boolean' }, welcomeMessage: { type: 'string', nullable: true }, model: { type: 'string', nullable: true }, updatedAt: { type: 'string', format: 'date-time' } } } })
  upsertChatbotConfigEndpoint(@Body() body: UpsertChatbotConfigDto) {
    return this.upsertChatbotConfig.execute(body);
  }

  // ── Chat Completion ────────────────────────────────────────────────────────

  @RequireFeature(FeatureKey.AI_CHATBOT)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({ summary: 'Send a chat message and receive an AI reply (Server-Sent Events)' })
  @ApiOkResponse({
    description: 'SSE stream of the AI reply — each event is a `data: <token>` line',
    content: {
      'text/event-stream': { schema: { type: 'string', description: 'SSE token stream' } },
    },
  })
  chatCompletionEndpoint(@Body() body: ChatCompletionDto) {
    return this.chatCompletion.execute(body);
  }
}
