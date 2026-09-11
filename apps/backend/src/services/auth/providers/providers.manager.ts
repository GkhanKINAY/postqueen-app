import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuthProviderAbstract } from '@gitroom/backend/services/auth/providers.interface';

@Injectable()
export class AuthProviderManager {
  constructor(private _moduleRef: ModuleRef) {}

  getProvider(provider: string): AuthProviderAbstract {
    const metadata =
      Reflect.getMetadata('auth-provider', AuthProviderAbstract) || [];

    const found = metadata.find(
      (m: any) => m.provider === provider
    );

    // A fixed message: the provider name comes from the request body, and this
    // error reaches the client.
    if (!found) {
      throw new Error('Unknown auth provider');
    }

    return this._moduleRef.get(found.target, { strict: false });
  }
}
