import '@/lib/api-client'; // ensure initClient runs before any authApi call
import { authApi } from '@deqah/api-client';
import type { AuthResponse, LoginPayload, LoginResponse as ClientLoginResponse } from '@deqah/api-client';

export type LoginRequest = LoginPayload;
export type LoginResponse = ClientLoginResponse;

export function isAuthResponse(res: LoginResponse): res is AuthResponse {
  return 'accessToken' in res;
}

export function login(body: LoginRequest): Promise<LoginResponse> {
  return authApi.login(body);
}
