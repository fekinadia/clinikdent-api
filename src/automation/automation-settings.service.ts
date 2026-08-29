import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAutomationSettingsDto } from './dto/automation-settings.dto';

@Injectable()
export class AutomationSettingsService {
  constructor(private prisma: PrismaService) {}

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

  async update(cabinetId: number, dto: UpdateAutomationSettingsDto) {
    await this.getOrCreate(cabinetId);

    return this.prisma.automationSettings.update({
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
  }
}
