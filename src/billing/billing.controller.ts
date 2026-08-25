import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { BillingService } from './billing.service';
import { CheckoutDto } from './dto/billing.dto';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: "Statut de l'abonnement du cabinet courant" })
  getStatus(@CurrentUser() user: CurrentUserType) {
    return this.billingService.getStatus(user.cabinetId);
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Générer un lien de paiement Konnect pour un plan' })
  checkout(@CurrentUser() user: CurrentUserType, @Body() dto: CheckoutDto) {
    return this.billingService.createCheckout(user.cabinetId, dto.plan);
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
