import { buildCorsOptions } from './cors.config';

describe('buildCorsOptions', () => {
  it("lève une erreur en production si CORS_ORIGINS est absent (jamais de repli sur '*')", () => {
    expect(() => buildCorsOptions('production', undefined)).toThrow();
    expect(() => buildCorsOptions('production', '')).toThrow();
    expect(() => buildCorsOptions('production', '   ')).toThrow();
  });

  it('utilise la liste explicite en production quand CORS_ORIGINS est fournie', () => {
    const result = buildCorsOptions(
      'production',
      'https://clinikdent-web.vercel.app, https://autre-domaine.tn',
    );
    expect(result).toEqual({
      origin: ['https://clinikdent-web.vercel.app', 'https://autre-domaine.tn'],
      credentials: true,
    });
  });

  it('reste permissif en développement si aucune origine n\'est définie', () => {
    const result = buildCorsOptions('development', undefined);
    expect(result).toEqual({ origin: true, credentials: true });
  });

  it('respecte CORS_ORIGINS même en développement si elle est fournie', () => {
    const result = buildCorsOptions('development', 'http://localhost:5173');
    expect(result).toEqual({ origin: ['http://localhost:5173'], credentials: true });
  });
});
