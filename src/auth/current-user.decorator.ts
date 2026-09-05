import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from './roles.decorator';

export interface CurrentUserType {
  userId: number;
  email: string;
  cabinetId: number;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserType => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
