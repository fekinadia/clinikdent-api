import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildCorsOptions } from './config/cors.config';
import { shouldEnableSwagger } from './config/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const nodeEnv = process.env.NODE_ENV;

  // CORS pour permettre web + mobile + desktop — jamais de repli sur '*' en
  // production (voir src/config/cors.config.ts et l'audit du 2026-09-05).
  app.enableCors(buildCorsOptions(nodeEnv, process.env.CORS_ORIGINS));

  // Validation automatique des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Préfixe global pour toutes les routes
  app.setGlobalPrefix('api/v1');

  // Documentation Swagger automatique — jamais exposée en production
  // (voir src/config/swagger.config.ts et l'audit du 2026-09-05).
  if (shouldEnableSwagger(nodeEnv)) {
    const config = new DocumentBuilder()
      .setTitle('ClinikDent API')
      .setDescription('API du logiciel de gestion de cabinet dentaire ClinikDent')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🦷 ClinikDent API démarrée sur http://localhost:${port}`);
  if (shouldEnableSwagger(nodeEnv)) {
    console.log(`📚 Documentation : http://localhost:${port}/api/docs`);
  }
}

bootstrap();
