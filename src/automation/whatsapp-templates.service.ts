import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWhatsAppTemplateDto, UpdateWhatsAppTemplateDto } from './dto/whatsapp-template.dto';

@Injectable()
export class WhatsAppTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(cabinetId: number, type?: string) {
    return this.prisma.whatsAppTemplate.findMany({
      where: { cabinetId, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(cabinetId: number, userId: number, dto: CreateWhatsAppTemplateDto) {
    return this.prisma.whatsAppTemplate.create({
      data: {
        cabinetId,
        type: dto.type,
        nom: dto.nom,
        contenu: dto.contenu,
        statutApprobation: 'brouillon',
        createdById: userId,
      },
    });
  }

  private async assertTemplateDuCabinet(cabinetId: number, id: number) {
    const template = await this.prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template introuvable');
    if (template.cabinetId !== cabinetId) {
      throw new ForbiddenException("Ce template n'appartient pas à votre cabinet");
    }
    return template;
  }

  async update(cabinetId: number, id: number, dto: UpdateWhatsAppTemplateDto) {
    const template = await this.assertTemplateDuCabinet(cabinetId, id);

    const contenuChange = dto.contenu !== undefined && dto.contenu !== template.contenu;

    return this.prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        ...(dto.nom !== undefined ? { nom: dto.nom } : {}),
        ...(dto.contenu !== undefined ? { contenu: dto.contenu } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(contenuChange ? { statutApprobation: 'brouillon', metaTemplateName: null } : {}),
      },
    });
  }

  async delete(cabinetId: number, id: number) {
    await this.assertTemplateDuCabinet(cabinetId, id);
    await this.prisma.whatsAppTemplate.delete({ where: { id } });
    return { success: true };
  }
}
