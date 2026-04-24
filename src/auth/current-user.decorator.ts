import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserType {
  userId: number;
  email: string;
  cabinetId: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserType => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
