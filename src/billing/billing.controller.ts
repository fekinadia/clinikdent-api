import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { BillingService } from './billing.service';
import { CheckoutDto } from './dto/billing.dto';

// L'abonnement ClinikDent lui-même (par opposition à la facturation des
// patients, voir FinanceController) est une information et une action
// réservées aux administrateurs du cabinet — voir la matrice
// d'autorisation de l'audit du 2026-09-05.
@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @Roles('admin')
  @ApiOperation({ summary: "Statut de l'abonnement du cabinet courant (admin uniquement)" })
  getStatus(@CurrentUser() user: CurrentUserType) {
    return this.billingService.getStatus(user.cabinetId);
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Générer un lien de paiement Konnect pour un plan (admin uniquement)' })
  checkout(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: CheckoutDto,
    @Req() req: Request,
  ) {
    return this.billingService.createCheckout(user.cabinetId, dto.plan, {
      userId: user.userId,
      ipAddress: req.ip,
    });
  }

  // Pas de garde JWT ici : c'est Konnect qui appelle cette route (callback
  // serveur à serveur), pas le navigateur d'un utilisateur connecté.
  @Get('webhook')
  @ApiOperation({ summary: 'Callback Konnect après paiement (non authentifié)' })
  webhook(
    @Query('payment_id') paymentId?: string,
    @Query('paymentId') paymentIdAlt?: string,
  ) {
    return this.billingService.handleWebhook(paymentId || paymentIdAlt);
  }
}
