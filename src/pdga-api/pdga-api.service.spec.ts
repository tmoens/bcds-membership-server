import { Test, TestingModule } from '@nestjs/testing';
import { PdgaApiService } from './pdga-api.service';

describe('PdgaApiService', () => {
  let service: PdgaApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdgaApiService],
    }).compile();

    service = module.get<PdgaApiService>(PdgaApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
