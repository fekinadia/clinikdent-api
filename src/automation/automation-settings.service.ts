import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { UpdateAutomationSettingsDto } from './dto/automation-settings.dto';

export interface ActorContext {
  userId: number;
  ipAddress?: string | null;
}

@Injectable()
export class AutomationSettingsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  private async getOrCreate(cabinetId: number) {
    const existing = await this.prisma.automationSettings.findUnique({
      where: { cabinetId },
    });
    if (existing) return existing;

    return this.prisma.automationSettings.create({
      data: { cabinetId },
    });
  }

  async get(cabinetId: number) {
    return this.getOrCreate(cabinetId);
  }

  async update(cabinetId: number, dto: UpdateAutomationSettingsDto, actor?: ActorContext) {
    await this.getOrCreate(cabinetId);

    const updated = await this.prisma.automationSettings.update({
      where: { cabinetId },
      data: {
        ...(dto.rappelsActifs !== undefined ? { rappelsActifs: dto.rappelsActifs } : {}),
        ...(dto.noShowActif !== undefined ? { noShowActif: dto.noShowActif } : {}),
        ...(dto.recallActif !== undefined ? { recallActif: dto.recallActif } : {}),
        ...(dto.rappelOffsetsHeures !== undefined
          ? { rappelOffsetsHeures: dto.rappelOffsetsHeures }
          : {}),
        ...(dto.delaiNoShowHeures !== undefined
          ? { delaiNoShowHeures: dto.delaiNoShowHeures }
          : {}),
        ...(dto.recallDefautMois !== undefined ? { recallDefautMois: dto.recallDefautMois } : {}),
      },
    });

    // STEP 4 — journalisation des changements de réglages d'automatisation
    // (noShowActif / delaiNoShowHeures en particulier influencent directement
    // le comportement de détection). On ne journalise que les champs
    // effectivement fournis dans la requête, jamais l'objet complet.
    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: 'automation_settings.update',
      entityType: 'AutomationSettings',
      entityId: updated.id,
      details: { champsModifies: Object.keys(dto) },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }
}
