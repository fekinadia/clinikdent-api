import { shouldEnableSwagger } from './swagger.config';

describe('shouldEnableSwagger', () => {
  it('désactive Swagger en production', () => {
    expect(shouldEnableSwagger('production')).toBe(false);
  });

  it('active Swagger en développement', () => {
    expect(shouldEnableSwagger('development')).toBe(true);
  });

  it("active Swagger quand NODE_ENV n'est pas défini", () => {
    expect(shouldEnableSwagger(undefined)).toBe(true);
  });
});
