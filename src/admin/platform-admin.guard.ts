import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const adminEmails = (this.config.get<string>('PLATFORM_ADMIN_EMAILS') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!user?.email || !adminEmails.includes(user.email.toLowerCase())) {
      throw new ForbiddenException(
        "Accès réservé à l'administrateur de la plateforme",
      );
    }

    return true;
  }
}
