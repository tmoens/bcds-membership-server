import { Test, TestingModule } from '@nestjs/testing';
import { MembershipSheetService } from './membership-sheet.service';

describe('MembershipSheetService', () => {
  let service: MembershipSheetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MembershipSheetService],
    }).compile();

    service = module.get<MembershipSheetService>(MembershipSheetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
