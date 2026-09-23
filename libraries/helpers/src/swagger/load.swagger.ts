import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

// Only the modules passed in are documented. The backend passes its public
// API module, so /docs describes what an API key can call and nothing of the
// app's own internal routes.
export const loadSwagger = (app: INestApplication, include: Function[]) => {
  const config = new DocumentBuilder()
    .setTitle('PostQueen public API')
    .setDescription(
      'Send your API key, from Connections > API Keys, as the Authorization header. No Bearer prefix.'
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config, { include });
  SwaggerModule.setup('docs', app, document);
};
