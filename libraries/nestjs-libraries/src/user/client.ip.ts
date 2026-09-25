import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Which hops may speak for the client in X-Forwarded-For, as Express `trust
 * proxy` (set in apps/backend/src/main.ts). Production is two proxies deep:
 * the host's nginx appends the client, then the container's nginx appends the
 * Docker gateway (172.19.0.1) and connects from 127.0.0.1. Express walks the
 * header from the right past these private and loopback hops, so `req.ip` is
 * the address the host's nginx saw, and whatever the client wrote in the
 * header itself is never reached.
 *
 * A client on a private network in front of a private proxy can still name
 * itself; that is the one place this trusts too much, and it is not the
 * public internet.
 */
export const TRUSTED_PROXIES = 'loopback, linklocal, uniquelocal';

/**
 * The client's address, as resolved by `trust proxy` above. Use this instead
 * of `@RealIP()` from nestjs-real-ip, which returns the FIRST X-Forwarded-For
 * entry: the one the client writes, so every per-address limit keyed on it
 * could be stepped around with a made-up header.
 */
export const ClientIp = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.ip;
  }
);
