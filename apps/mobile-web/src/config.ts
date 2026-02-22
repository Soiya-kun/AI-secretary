export type AppConfig = {
  apiBaseUrl: string;
  cognitoDomain: string;
  cognitoClientId: string;
  cognitoRedirectUri: string;
  cognitoScope: string;
};

declare global {
  interface Window {
    __AI_SECRETARY_CONFIG__?: Partial<AppConfig>;
  }
}

const required = (name: keyof AppConfig, fallback: string): string => {
  const value = window.__AI_SECRETARY_CONFIG__?.[name] ?? fallback;
  return value;
};

export const appConfig: AppConfig = {
  apiBaseUrl: required('apiBaseUrl', 'http://localhost:3000'),
  cognitoDomain: required('cognitoDomain', 'https://example.auth.ap-northeast-1.amazoncognito.com'),
  cognitoClientId: required('cognitoClientId', 'replace-me'),
  cognitoRedirectUri: required('cognitoRedirectUri', 'http://localhost:5173'),
  cognitoScope: required('cognitoScope', 'openid profile email')
};

export const buildCognitoLoginUrl = (config: AppConfig): string => {
  const authorizeUrl = new URL('/oauth2/authorize', config.cognitoDomain);
  authorizeUrl.searchParams.set('client_id', config.cognitoClientId);
  authorizeUrl.searchParams.set('response_type', 'token');
  authorizeUrl.searchParams.set('scope', config.cognitoScope);
  authorizeUrl.searchParams.set('redirect_uri', config.cognitoRedirectUri);
  return authorizeUrl.toString();
};
