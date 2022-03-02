import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlayersModule } from './players/players.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentModule } from './payment/payment.module';
import { HttpModule } from '@nestjs/axios';
import { PdgaApiModule } from './pdga-api/pdga-api.module';
import { MembershipSheetModule } from './membership-sheet/membership-sheet.module';

@Module({
  imports: [
    PlayersModule,
    MembershipsModule,
    HttpModule,
    PdgaApiModule,
    ConfigModule.forRoot({
      isGlobal: true,

      envFilePath: process.env.NODE_ENV
        ? `environments/${process.env.NODE_ENV}.env`
        : `environments/development.env`,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),

        DB_PORT: Joi.number().default(3306),
        DB_HOST: Joi.string().default('localhost'),
        DB_NAME: Joi.string().required(),
        DB_USER: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),

        BCDS_MEMBERSHIP_SHEET: Joi.string().required(),
        GOOGLE_APPLICATION_CREDENTIALS: Joi.string().required(),

        LATENCY_FOR_RELOAD_IN_SECONDS: Joi.number().default(60),

        PDGA_API_USER: Joi.string().required(),
        PDGA_API_PASSWORD: Joi.string().required(),
      }),
      validationOptions: {
        allowUnknown: true,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mariadb',
        host: configService.get('DB_HOST'),
        port: +configService.get<number>('DB_PORT'),
        username: configService.get('DB_USER'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    PaymentModule,
    MembershipSheetModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
