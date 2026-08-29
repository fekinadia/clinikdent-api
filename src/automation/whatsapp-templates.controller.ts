import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { CreateWhatsAppTemplateDto, UpdateWhatsAppTemplateDto } from './dto/whatsapp-template.dto';

@ApiTags('WhatsApp Templates')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('whatsapp-templates')
export class WhatsAppTemplatesController {
  constructor(private whatsappTemplatesService: WhatsAppTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les templates WhatsApp du cabinet' })
  findAll(@CurrentUser() user: CurrentUserType, @Query('type') type?: string) {
    return this.whatsappTemplatesService.findAll(user.cabinetId, type);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un template WhatsApp (statut brouillon)' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateWhatsAppTemplateDto) {
    return this.whatsappTemplatesService.create(user.cabinetId, user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un template (repasse en brouillon si le contenu change)' })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWhatsAppTemplateDto,
  ) {
    return this.whatsappTemplatesService.update(user.cabinetId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un template' })
  delete(@CurrentUser() user: CurrentUserType, @Param('id', ParseIntPipe) id: number) {
    return this.whatsappTemplatesService.delete(user.cabinetId, id);
  }
}
