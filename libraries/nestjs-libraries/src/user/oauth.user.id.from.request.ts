import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// The user who approved the OAuth app a public API call came with. Unset for
// an API key, which belongs to the whole organization.
export const GetOAuthUserIdFromRequest = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.oauthUserId as string | undefined;
  }
);
