import { adresseClient } from './ip-throttler.guard';

describe('adresseClient', () => {
  it("prend l'adresse donnée par Cloudflare, placé devant Render", () => {
    expect(
      adresseClient({
        headers: { 'cf-connecting-ip': '41.0.0.1', 'x-forwarded-for': '41.0.0.1, 10.0.0.1' },
        ip: '10.0.0.1',
      }),
    ).toBe('41.0.0.1');
  });

  it('prend sinon le premier maillon de x-forwarded-for', () => {
    expect(adresseClient({ headers: { 'x-forwarded-for': '41.0.0.2, 10.0.0.1' }, ip: '10.0.0.1' })).toBe(
      '41.0.0.2',
    );
  });

  it("garde l'adresse directe en dernier recours", () => {
    expect(adresseClient({ headers: {}, ip: '127.0.0.1' })).toBe('127.0.0.1');
    expect(adresseClient({ headers: {} })).toBe('inconnue');
  });
});
