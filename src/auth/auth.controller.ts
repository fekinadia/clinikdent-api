import { Body, Controller, Post, Patch, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtGuard } from './jwt.guard';
import { CurrentUser, CurrentUserType } from './current-user.decorator';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Se connecter' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Volet "changer mon mot de passe" (2026-09-21) — self-service pour un
  // utilisateur déjà connecté (voir AuthService.changePassword). Un vrai
  // "mot de passe oublié" par email reste à construire séparément.
  @Patch('change-password')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changer son propre mot de passe (utilisateur connecté)' })
  changePassword(@CurrentUser() user: CurrentUserType, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto);
  }
}
