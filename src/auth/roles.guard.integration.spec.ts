import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { JwtGuard } from './jwt.guard';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

const SECRET = 'probe-secret';
let dbRole = 'admin';

@UseGuards(JwtGuard)
@Controller('probe')
class ProbeController {
  @Roles('admin', 'medecin')
  @Get()
  get() { return { ok: true }; }
}

describe('RolesGuard global + JwtGuard contrôleur (bout en bout)', () => {
  let app: INestApplication;
  let url: string;
  const token = jwt.sign({ sub: 1, email: 'a@b.c', cabinetId: 1 }, SECRET);
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [ProbeController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { get: () => SECRET } },
        { provide: PrismaService, useValue: { user: { findUnique: async () => ({ id: 1, email: 'a@b.c', cabinetId: 1, role: dbRole, actif: true, cabinet: { estDemo: false } }) } } },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = mod.createNestApplication();
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1') + '/probe';
  });
  afterAll(() => app.close());

  it('admin connecté → 200', async () => {
    dbRole = 'admin';
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
  });
  it('rôle non autorisé → 403', async () => {
    dbRole = 'comptable';
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
  });
  it('sans jeton → 401', async () => {
    const res = await fetch(url);
    expect(res.status).toBe(401);
  });
  it('jeton invalide → 401', async () => {
    const res = await fetch(url, { headers: { Authorization: 'Bearer abc' } });
    expect(res.status).toBe(401);
  });
});
