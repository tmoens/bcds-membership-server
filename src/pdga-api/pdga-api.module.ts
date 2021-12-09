import { Module } from '@nestjs/common';
import { PdgaApiService } from './pdga-api.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  providers: [PdgaApiService],
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  exports: [PdgaApiService],
})
export class PdgaApiModule {}
