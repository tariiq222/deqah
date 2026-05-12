import { ChatAdapter } from './chat.adapter';

const buildConfig = (openrouterApiKey = 'or-key') => ({
  get: jest.fn().mockReturnValue({
    openrouterApiKey,
    openrouterBaseUrl: 'https://openrouter.ai/api/v1',
    chatModel: 'openai/gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
  }),
});

describe('ChatAdapter', () => {
  it('isAvailable returns false when OPENROUTER_API_KEY not set', () => {
    const adapter = new ChatAdapter(buildConfig('') as never);
    adapter.onModuleInit();
    expect(adapter.isAvailable()).toBe(false);
  });

  it('isAvailable returns true after onModuleInit with valid key', () => {
    const adapter = new ChatAdapter(buildConfig('or-key') as never);
    adapter.onModuleInit();
    expect(adapter.isAvailable()).toBe(true);
  });

  it('complete throws when adapter is not available', async () => {
    const adapter = new ChatAdapter(buildConfig('') as never);
    adapter.onModuleInit();
    await expect(adapter.complete([{ role: 'user', content: 'Hello' }])).rejects.toThrow(/not available/);
  });

  it('stream throws when adapter is not available', async () => {
    const adapter = new ChatAdapter(buildConfig('') as never);
    adapter.onModuleInit();
    const gen = adapter.stream([{ role: 'user', content: 'Hello' }]);
    await expect(gen[Symbol.asyncIterator]().next()).rejects.toThrow(/not available/);
  });

  it('complete calls OpenAI client and returns content', async () => {
    const adapter = new ChatAdapter(buildConfig() as never);
    adapter.onModuleInit();
    (adapter as unknown as Record<string, unknown>)['client'] = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'Hi there' } }],
            usage: { total_tokens: 10 },
            model: 'openai/gpt-4o-mini',
          }),
        },
      },
    };
    const result = await adapter.complete([{ role: 'user', content: 'Hello' }]);
    expect(result).toEqual({ content: 'Hi there', tokensUsed: 10, model: 'openai/gpt-4o-mini' });
  });

  it('stream yields content chunks from OpenAI streaming response', async () => {
    const adapter = new ChatAdapter(buildConfig() as never);
    adapter.onModuleInit();
    const mockStream = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            [Symbol.asyncIterator]: async function* () {
              yield { choices: [{ delta: { content: 'Hello ' } }] };
              yield { choices: [{ delta: { content: 'world' } }] };
            },
          }),
        },
      },
    };
    (adapter as unknown as Record<string, unknown>)['client'] = mockStream;

    const chunks: string[] = [];
    for await (const chunk of adapter.stream([{ role: 'user', content: 'Hi' }])) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Hello ', 'world']);
  });

  it('stream skips chunks without delta content', async () => {
    const adapter = new ChatAdapter(buildConfig() as never);
    adapter.onModuleInit();
    const mockStream = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            [Symbol.asyncIterator]: async function* () {
              yield { choices: [{ delta: {} }] };
              yield { choices: [{ delta: { content: 'visible' } }] };
            },
          }),
        },
      },
    };
    (adapter as unknown as Record<string, unknown>)['client'] = mockStream;

    const chunks: string[] = [];
    for await (const chunk of adapter.stream([{ role: 'user', content: 'Hi' }])) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['visible']);
  });
});