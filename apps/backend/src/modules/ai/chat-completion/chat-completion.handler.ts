import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { ChatAdapter } from '../../../infrastructure/ai';
import { SemanticSearchHandler } from '../semantic-search/semantic-search.handler';
import { ChatCompletionDto, ChatCompletionResult } from './chat-completion.dto';

export type ChatCompletionCommand = ChatCompletionDto;

const MAX_OUTPUT_TOKENS = 800;

const SYSTEM_PROMPT_TEMPLATE = (context: string) => `
You are a helpful assistant for a medical clinic using Deqah.
Answer the user's question based ONLY on the following context.
If the context doesn't contain the answer, say you don't have that information.

Context:
${context || '(No relevant information found in the knowledge base for this question.)'}
`.trim();

@Injectable()
export class ChatCompletionHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly search: SemanticSearchHandler,
    private readonly chat: ChatAdapter,
  ) {}

  async execute(dto: ChatCompletionCommand): Promise<ChatCompletionResult> {
    if (!this.chat.isAvailable()) {
      throw new BadRequestException('ChatAdapter is not available — set OPENROUTER_API_KEY');
    }

    const organizationId = this.tenant.requireOrganizationIdOrDefault();

    const chunks = await this.search.execute({
      query: dto.userMessage,
      topK: 5,
    });

    const context = chunks.map((c) => c.content).join('\n\n');

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT_TEMPLATE(context) },
      { role: 'user' as const, content: dto.userMessage },
    ];

    const reply = await this.chat.complete(messages, undefined, { maxTokens: MAX_OUTPUT_TOKENS });

    let sessionId = dto.sessionId;
    if (!sessionId) {
      const session = await this.prisma.chatSession.create({
        data: {
          organizationId, // SaaS-02f
          clientId: dto.clientId,
          userId: dto.userId,
        },
      });
      sessionId = session.id;
    }

    await this.prisma.chatMessage.createMany({
      data: [
        { organizationId, sessionId, role: 'user', content: dto.userMessage },
        { organizationId, sessionId, role: 'assistant', content: reply },
      ],
    });

    return { sessionId, reply, sourcesUsed: chunks.length };
  }
}
