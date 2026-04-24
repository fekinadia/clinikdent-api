import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS pour permettre web + mobile + desktop
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    credentials: true,
  });

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

  // Documentation Swagger automatique
  const config = new DocumentBuilder()
    .setTitle('ClinikDent API')
    .setDescription('API du logiciel de gestion de cabinet dentaire ClinikDent')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🦷 ClinikDent API démarrée sur http://localhost:${port}`);
  console.log(`📚 Documentation : http://localhost:${port}/api/docs`);
}

bootstrap();
