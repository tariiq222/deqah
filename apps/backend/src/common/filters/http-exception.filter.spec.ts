import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { ClsService } from 'nestjs-cls';
import { HttpExceptionFilter } from './http-exception.filter';
import { RequestContextStorage } from '../http/request-context';

jest.mock('@sentry/node', () => ({
  withScope: jest.fn(),
  captureException: jest.fn(),
}));

const makeClsService = (organizationId?: string): ClsService => ({
  get: jest.fn().mockReturnValue(organizationId ? { organizationId } : undefined),
} as unknown as ClsService);

const makeHost = (statusFn = jest.fn(), jsonFn = jest.fn(), headers: Record<string, string> = {}) => ({
  switchToHttp: () => ({
    getRequest: () => ({ method: 'GET', url: '/test', path: '/test', headers }),
    getResponse: () => ({
      status: (code: number) => { statusFn(code); return { json: jsonFn }; },
    }),
  }),
});

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockCls: ClsService;

  beforeEach(() => {
    mockCls = makeClsService();
    filter = new HttpExceptionFilter(mockCls);
  });

  afterEach(() => {
    (RequestContextStorage as { delete?: () => void }).delete?.();
  });

  it('returns correct status for HttpException', () => {
    const statusFn = jest.fn();
    const jsonFn = jest.fn();
    filter.catch(new BadRequestException('bad input'), makeHost(statusFn, jsonFn) as any);
    expect(statusFn).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'bad input' }),
    );
  });

  it('returns 500 for unknown errors', () => {
    const statusFn = jest.fn();
    const jsonFn = jest.fn();
    filter.catch(new Error('unexpected'), makeHost(statusFn, jsonFn) as any);
    expect(statusFn).toHaveBeenCalledWith(500);
  });

  it('includes timestamp and path in response', () => {
    const jsonFn = jest.fn();
    filter.catch(new HttpException('fail', HttpStatus.FORBIDDEN), makeHost(jest.fn(), jsonFn) as any);
    const body = jsonFn.mock.calls[0][0];
    expect(body.timestamp).toBeDefined();
    expect(body.path).toBe('/test');
  });

  it('includes array messages from ValidationPipe-style errors', () => {
    const jsonFn = jest.fn();
    const ex = new HttpException({ message: ['field is required'], error: 'Bad Request' }, 400);
    filter.catch(ex, makeHost(jest.fn(), jsonFn) as any);
    const body = jsonFn.mock.calls[0][0];
    expect(Array.isArray(body.message)).toBe(true);
  });

  it('uses exception message when exceptionResponse is null', () => {
    const jsonFn = jest.fn();
    filter.catch(new Error('something went wrong'), makeHost(jest.fn(), jsonFn) as any);
    const body = jsonFn.mock.calls[0][0];
    expect(body.message).toBe('something went wrong');
  });

  it('uses HttpStatus name when exceptionResponse has no error field', () => {
    const jsonFn = jest.fn();
    filter.catch(new HttpException({ message: 'test' }, 404), makeHost(jest.fn(), jsonFn) as any);
    const body = jsonFn.mock.calls[0][0];
    expect(body.error).toBe('NOT_FOUND');
  });

  it('extracts message from nested object response', () => {
    const jsonFn = jest.fn();
    filter.catch(new HttpException({ message: 'custom message' }, 400), makeHost(jest.fn(), jsonFn) as any);
    const body = jsonFn.mock.calls[0][0];
    expect(body.message).toBe('custom message');
  });

  it('falls back to default message when exceptionResponse is object but message is missing', () => {
    const jsonFn = jest.fn();
    filter.catch(new HttpException({} as never, 400), makeHost(jest.fn(), jsonFn) as any);
    const body = jsonFn.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
  });

  it('logs 500 errors with exception stack', () => {
    const jsonFn = jest.fn();
    filter.catch(new HttpException('Server error', 500), makeHost(jest.fn(), jsonFn) as any);
    expect(jsonFn).toHaveBeenCalled();
  });

  it('includes requestId from RequestContextStorage when available', () => {
    const jsonFn = jest.fn();
    RequestContextStorage.run({ requestId: 'req-123' }, () => {
      filter.catch(new BadRequestException('bad'), makeHost(jest.fn(), jsonFn) as any);
    });
    const body = jsonFn.mock.calls[0][0];
    expect(body.requestId).toBe('req-123');
  });

  it('sets requestId to undefined when RequestContextStorage is empty', () => {
    const jsonFn = jest.fn();
    filter.catch(new BadRequestException('bad'), makeHost(jest.fn(), jsonFn) as any);
    const body = jsonFn.mock.calls[0][0];
    expect(body.requestId).toBeUndefined();
  });

  it('preserves custom keys (e.g. code, violations) from structured exceptions', () => {
    const jsonFn = jest.fn();
    const ex = new HttpException(
      {
        code: 'DOWNGRADE_VIOLATES_NEW_LIMITS',
        message: 'Cannot downgrade',
        messageAr: 'لا يمكن التخفيض',
        violations: [
          { kind: 'QUANTITATIVE', featureKey: 'employees', current: 12, targetMax: 5 },
        ],
      },
      422,
    );
    filter.catch(ex, makeHost(jest.fn(), jsonFn) as any);
    const body = jsonFn.mock.calls[0][0];
    expect(body.code).toBe('DOWNGRADE_VIOLATES_NEW_LIMITS');
    expect(body.messageAr).toBe('لا يمكن التخفيض');
    expect(body.violations).toEqual([
      { kind: 'QUANTITATIVE', featureKey: 'employees', current: 12, targetMax: 5 },
    ]);
    // Reserved keys still set normally
    expect(body.statusCode).toBe(422);
    expect(body.message).toBe('Cannot downgrade');
  });

  it('does not allow custom keys to overwrite reserved fields', () => {
    const jsonFn = jest.fn();
    const ex = new HttpException(
      { message: 'real msg', statusCode: 999, path: '/spoofed', timestamp: 'fake' },
      400,
    );
    filter.catch(ex, makeHost(jest.fn(), jsonFn) as any);
    const body = jsonFn.mock.calls[0][0];
    expect(body.statusCode).toBe(400);
    expect(body.path).toBe('/test');
    expect(body.timestamp).not.toBe('fake');
  });

  describe('Sentry scope tags', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('attaches requestId + userId tags on 5xx', () => {
      const setTag = jest.fn();
      const setUser = jest.fn();
      (Sentry.withScope as jest.Mock).mockImplementation((cb: (scope: { setTag: jest.Mock; setUser: jest.Mock }) => void) =>
        cb({ setTag, setUser }),
      );

      const host: any = {
        switchToHttp: () => ({
          getRequest: () => ({ method: 'POST', url: '/api/v1/x', path: '/api/v1/x', route: { path: '/api/v1/x' }, headers: {} }),
          getResponse: () => ({ status: () => ({ json: jest.fn() }) }),
        }),
      };

      RequestContextStorage.run(
        { requestId: 'rid-1', userId: 'u-1' },
        () => {
          filter.catch(new Error('boom'), host);
        },
      );

      expect(Sentry.withScope).toHaveBeenCalledTimes(1);
      expect(setTag).toHaveBeenCalledWith('requestId', 'rid-1');
      expect(setTag).toHaveBeenCalledWith('route', 'POST /api/v1/x');
      expect(setUser).toHaveBeenCalledWith({ id: 'u-1' });
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('tags organizationId from CLS on 5xx', () => {
      const setTag = jest.fn();
      const setUser = jest.fn();
      (Sentry.withScope as jest.Mock).mockImplementation((cb: (scope: { setTag: jest.Mock; setUser: jest.Mock }) => void) =>
        cb({ setTag, setUser }),
      );

      const clsWithOrg = makeClsService('org-abc-123');
      const filterWithOrg = new HttpExceptionFilter(clsWithOrg);

      const host: any = {
        switchToHttp: () => ({
          getRequest: () => ({ method: 'GET', url: '/api/v1/x', path: '/api/v1/x', route: { path: '/api/v1/x' }, headers: {} }),
          getResponse: () => ({ status: () => ({ json: jest.fn() }) }),
        }),
      };

      filterWithOrg.catch(new Error('boom'), host);

      expect(Sentry.withScope).toHaveBeenCalledTimes(1);
      expect(setTag).toHaveBeenCalledWith('organizationId', 'org-abc-123');
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('tags organizationId as "unknown" when CLS has no tenant on 5xx', () => {
      const setTag = jest.fn();
      const setUser = jest.fn();
      (Sentry.withScope as jest.Mock).mockImplementation((cb: (scope: { setTag: jest.Mock; setUser: jest.Mock }) => void) =>
        cb({ setTag, setUser }),
      );

      const host: any = {
        switchToHttp: () => ({
          getRequest: () => ({ method: 'GET', url: '/api/v1/x', path: '/api/v1/x', route: { path: '/api/v1/x' }, headers: {} }),
          getResponse: () => ({ status: () => ({ json: jest.fn() }) }),
        }),
      };

      // filter uses mockCls which returns undefined for get()
      filter.catch(new Error('boom'), host);

      expect(setTag).toHaveBeenCalledWith('organizationId', 'unknown');
    });

    it('sets requestId tag from x-request-id header when present on 5xx', () => {
      const setTag = jest.fn();
      const setUser = jest.fn();
      (Sentry.withScope as jest.Mock).mockImplementation((cb: (scope: { setTag: jest.Mock; setUser: jest.Mock }) => void) =>
        cb({ setTag, setUser }),
      );

      const host: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            url: '/api/v1/x',
            path: '/api/v1/x',
            route: { path: '/api/v1/x' },
            headers: { 'x-request-id': 'header-req-id' },
          }),
          getResponse: () => ({ status: () => ({ json: jest.fn() }) }),
        }),
      };

      filter.catch(new Error('boom'), host);

      expect(setTag).toHaveBeenCalledWith('requestId', 'header-req-id');
    });

    it('does not call Sentry.withScope on 4xx', () => {
      const host: any = {
        switchToHttp: () => ({
          getRequest: () => ({ method: 'GET', url: '/x', path: '/x', route: { path: '/x' }, headers: {} }),
          getResponse: () => ({ status: () => ({ json: jest.fn() }) }),
        }),
      };

      filter.catch(new BadRequestException('nope'), host);

      expect(Sentry.withScope).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });
});
