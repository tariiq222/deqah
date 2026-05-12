import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { AiConfig } from './ai.config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  content: string;
  tokensUsed: number;
  model: string;
}

export interface IChatService {
  complete(messages: ChatMessage[], model?: string, options?: { maxTokens?: number }): Promise<CompletionResult>;
  stream(messages: ChatMessage[], model?: string): AsyncIterable<string>;
  isAvailable(): boolean;
}

@Injectable()
export class ChatAdapter implements IChatService, OnModuleInit {
  private readonly logger = new Logger(ChatAdapter.name);
  private client?: OpenAI;
  private defaultModel: string;

  constructor(private readonly config: ConfigService) {
    const cfg = this.config.get<AiConfig>('ai')!;
    this.defaultModel = cfg.chatModel;
  }

  onModuleInit(): void {
    const cfg = this.config.get<AiConfig>('ai')!;
    if (!cfg.openrouterApiKey) {
      this.logger.warn('OPENROUTER_API_KEY not set — ChatAdapter disabled');
      return;
    }
    this.client = new OpenAI({
      apiKey: cfg.openrouterApiKey,
      baseURL: cfg.openrouterBaseUrl,
      defaultHeaders: {
        'HTTP-Referer': 'https://deqah.app',
        'X-Title': 'Deqah AI',
      },
    });
    this.logger.log(`ChatAdapter ready (model: ${this.defaultModel})`);
  }

  isAvailable(): boolean {
    return !!this.client;
  }

  async complete(messages: ChatMessage[], model?: string, options?: { maxTokens?: number }): Promise<CompletionResult> {
    if (!this.client) throw new Error('ChatAdapter is not available — set OPENROUTER_API_KEY');
    const response = await this.client.chat.completions.create({
      model: model ?? this.defaultModel,
      messages,
      ...(options?.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
    });
    return {
      content: response.choices[0]?.message?.content ?? '',
      tokensUsed: response.usage?.total_tokens ?? 0,
      model: response.model ?? model ?? this.defaultModel,
    };
  }

  async *stream(messages: ChatMessage[], model?: string): AsyncIterable<string> {
    if (!this.client) throw new Error('ChatAdapter is not available — set OPENROUTER_API_KEY');
    const streamResult = await this.client.chat.completions.create({
      model: model ?? this.defaultModel,
      messages,
      stream: true,
    });
    for await (const chunk of streamResult) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
