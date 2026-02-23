import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CurrentUser as ICurrentUser } from '../interfaces/current-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ICurrentUser | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.user ?? null;
  },
);
