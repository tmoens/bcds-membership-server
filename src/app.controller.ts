import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { AppService } from './app.service';
import { PdgaTournamentData } from './dtos/pdga-tournament-data';
import {
  BcdsTournamentMembershipReport,
  BdcsMemberMini,
} from './dtos/membership-status-report';
import { MemberAndPdgaPlayerData } from './dtos/MemberByPdgaNumber';

@UseInterceptors(ClassSerializerInterceptor)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('get-membership-by-pdga-number')
  async getMembershipByPdgaNumber(
    @Query() query,
  ): Promise<MemberAndPdgaPlayerData | null> {
    await this.appService.importBcdsMembershipGoogleDoc();
    return await this.appService.getMembershipByPdgaNumber(query.pdgaNumber);
  }

  @Get('get-memberships-by-name')
  async getMembershipByName(@Query() query): Promise<BdcsMemberMini[]> {
    await this.appService.importBcdsMembershipGoogleDoc();
    return await this.appService.getMembershipsByName(query.name);
  }

  @Get('check-tournament')
  async checkTournament(
    @Query() query,
  ): Promise<BcdsTournamentMembershipReport> {
    await this.appService.importBcdsMembershipGoogleDoc();
    return await this.appService.checkTournament(query.tournamentId);
  }

  @Get('get-tournament-data')
  async getTournamentData(@Query() query): Promise<PdgaTournamentData> {
    return await this.appService.getTournamentData(query.tournamentId);
  }
}
