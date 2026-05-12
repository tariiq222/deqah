import { ChatCompletionHandler } from './chat-completion.handler';

const mockSearchResult = {
  chunkId: 'c1', documentId: 'd1', content: 'Deqah supports online booking.', chunkIndex: 0, similarity: 0.9,
};

const mockPrisma = () => ({
  chatSession: {
    create: jest.fn().mockResolvedValue({ id: 'session-1' }),
  },
  chatMessage: {
    create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
  },
});

const mockTenant = (organizationId = 'org-A') => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue(organizationId),
});

const mockSearch = () => ({
  execute: jest.fn().mockResolvedValue([mockSearchResult]),
});

const mockChat = () => ({
  isAvailable: jest.fn().mockReturnValue(true),
  complete: jest.fn().mockResolvedValue({ content: 'You can book online through Deqah.', tokensUsed: 42, model: 'anthropic/claude-3.5-haiku' }),
});

const dto = {
  userMessage: 'How do I book an appointment?',
};

const build = () => {
  const prisma = mockPrisma();
  const tenant = mockTenant('org-A');
  const search = mockSearch();
  const chat = mockChat();
  const handler = new ChatCompletionHandler(
    prisma as never,
    tenant as never,
    search as never,
    chat as never,
  );
  return { handler, prisma, tenant, search, chat };
};

describe('ChatCompletionHandler', () => {
  it('returns assistant reply and sessionId', async () => {
    const { handler } = build();
    const result = await handler.execute(dto);
    expect(result.reply).toBe('You can book online through Deqah.');
    expect(result.sessionId).toBe('session-1');
  });

  it('creates ChatSession tagged with organizationId', async () => {
    const { handler, prisma } = build();
    await handler.execute(dto);
    expect(prisma.chatSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'org-A' }),
    });
  });

  it('persists user + assistant messages tagged with organizationId', async () => {
    const { handler, prisma } = build();
    await handler.execute(dto);
    // Handler calls chatMessage.create twice: once before the LLM call (user msg),
    // once after (assistant msg). Verify both calls carry the correct fields.
    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'user', organizationId: 'org-A' }),
      }),
    );
    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'assistant', organizationId: 'org-A' }),
      }),
    );
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2);
  });

  it('throws if ChatAdapter is not available', async () => {
    const prisma = mockPrisma();
    const tenant = mockTenant('org-A');
    const search = mockSearch();
    const chat = { isAvailable: jest.fn().mockReturnValue(false), complete: jest.fn() };
    const handler = new ChatCompletionHandler(prisma as never, tenant as never, search as never, chat as never);
    await expect(handler.execute(dto)).rejects.toThrow('ChatAdapter is not available');
  });
});
