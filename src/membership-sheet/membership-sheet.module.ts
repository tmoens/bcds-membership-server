import { Module } from '@nestjs/common';
import { MembershipSheetService } from './membership-sheet.service';

@Module({
  providers: [MembershipSheetService],
  exports: [MembershipSheetService],
})
export class MembershipSheetModule {}
