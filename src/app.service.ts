import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayersService } from './players/players.service';
import { PaymentService } from './payment/payment.service';
import { Payment } from './payment/entities/payment.entity';
import { Membership } from './memberships/entities/membership.entity';
import { MembershipsService } from './memberships/memberships.service';
import { getLogger } from 'log4js';
import { JobState, JobStats } from './helpers/jobstats';
import {
  BcdsTournamentMembershipReport,
  BdcsMemberMini,
} from './dtos/membership-status-report';
import { PdgaApiService, PdgaPlayerMini } from './pdga-api/pdga-api.service';
import { PdgaTournamentData } from './dtos/pdga-tournament-data';
import { ImportDto } from './membership-sheet/importDtos';
import { MembershipSheetService } from './membership-sheet/membership-sheet.service';
import { plainToClass } from 'class-transformer';
import { MemberAndPdgaPlayerData } from './dtos/MemberByPdgaNumber';
import { Player } from './players/entities/player.entity';

const logger = getLogger('appService');

@Injectable()
export class AppService {
  constructor(
    private configService: ConfigService,
    private playerService: PlayersService,
    private membershipService: MembershipsService,
    private paymentService: PaymentService,
    private pdgaApiService: PdgaApiService,
    private membershipSheetService: MembershipSheetService,
  ) {}

  async getTournamentData(tournamentId: string): Promise<PdgaTournamentData> {
    return this.pdgaApiService.getTournamentData(tournamentId);
  }

  // Check to see which players in a pdga tournament are BCDS members
  // on the day of the tournament.
  async checkTournament(
    tournamentId: string,
  ): Promise<BcdsTournamentMembershipReport | null> {
    const report: BcdsTournamentMembershipReport =
      new BcdsTournamentMembershipReport();
    report.tournamentData = await this.pdgaApiService.getTournamentData(
      tournamentId,
    );

    // if there is no such tournament, we are done here.
    if (!report.tournamentData) {
      return null;
    }
    // console.log(JSON.stringify(report.tournamentData));

    // We only check BC tournaments.
    // The GUI already prevents non-BC tournaments - but belt and suspenders
    if (report.tournamentData.state_prov !== 'BC') {
      // This code should never get hit.
      return null;
    }

    // For every player in the tournament we look to see if we know them
    // and if we don't we still make a record of the player in our database.
    const tournamentPlayers: PdgaPlayerMini[] =
      await this.pdgaApiService.getTournamentPlayers(tournamentId);

    // console.log(JSON.stringify(tournamentPlayers));

    for (const tp of tournamentPlayers) {
      const member: BdcsMemberMini = new BdcsMemberMini();
      member.name = tp.name;
      member.pdgaNumber = tp.pdgaNumber;

      const player: Player = await this.playerService.processPdgaPlayer(tp);

      // If we found the player, check if the player has a membership
      member.state = await this.membershipService.getMembershipState(
        player,
        report.tournamentData.start_date,
      );
      report.players.push(member);
    }
    return report;
  }

  // Given a PDGA number, see if the player is a current member.
  async getMembershipByPdgaNumber(
    pdgaNumber: string,
  ): Promise<MemberAndPdgaPlayerData | null> {
    const memberAndPdgaPlayerData = new MemberAndPdgaPlayerData();
    // Let's ask the PDGA if this number is "known" and if so, get data for them.
    memberAndPdgaPlayerData.pdgaPlayer =
      await this.pdgaApiService.getPlayerData(pdgaNumber);
    const player = await this.playerService.findByPdgaNumber(pdgaNumber);
    if (player) {
      memberAndPdgaPlayerData.membership = new BdcsMemberMini();
      memberAndPdgaPlayerData.membership.name = player.fullName;
      memberAndPdgaPlayerData.membership.state =
        await this.membershipService.getMembershipState(
          player,
          new Date().toISOString(),
        );
    }
    return memberAndPdgaPlayerData;
  }

  async getMembershipsByName(searchString: string): Promise<BdcsMemberMini[]> {
    const members = [];
    const today = new Date().toISOString();
    const players = await this.playerService.findByNameOrAlias(searchString);
    for (const p of players) {
      const m = new BdcsMemberMini();
      m.name = p.fullName;
      m.pdgaNumber = p.pdgaNumber;
      m.state = await this.membershipService.getMembershipState(p, today);
      members.push(m);
    }
    return members;
  }

  /*
   * Load up the BCDS Competitive member spreadsheet.
   * When doing this we need to watch out if the data in the membership
   * record we receive is for a player we already know about.
   * It isn't always that easy to tell!
   */
  async importBcdsMembershipGoogleDoc(): Promise<string> {
    const stats = new JobStats('Reload the BCDS membership spreadsheet.');
    stats.setStatus(JobState.IN_PROGRESS);

    const importData: ImportDto[] = await this.membershipSheetService.loadSheet(
      stats,
    );

    if (!importData) {
      return 'WTF';
    }

    stats.setCurrentActivity('Loading data into database');
    let rowNum = 0;
    for (const dto of importData) {
      rowNum++;
      // We can safely ignore any payment that has a payment confirmation code that we
      // have already processed.
      // But. If someone manually changes (i.e. fixes) a record in the payments
      // sheet, that change will not be caught by this software. Which means,
      // if the fix is important, it has to be done manually in the database.
      // Which is to say, this software is ad-hoc at best.
      if (
        await this.paymentService.confirmationCodeExists(
          dto.payment.confirmationCode,
        )
      ) {
        stats.bump('already processed');
        continue;
      }

      // See if we can find a player that matches the data on this record.
      // Or, failing that, create a new player.
      const player = await this.playerService.lookupOrCreate(dto.player);
      if (!player) {
        logger.error(
          `Could not find a matching player for row ${rowNum}. Skipping`,
        );
        stats.bump('no matching player');
        stats.bump('rows skipped');
        continue;
      }

      // Make a membership record
      const membership = new Membership();
      membership.validFrom = dto.membership.validFrom;
      membership.validUntil = dto.membership.validUntil;
      membership.payment = plainToClass(Payment, dto.payment);
      membership.player = player;
      await this.membershipService.save(membership);
      stats.bump('row processed successfully');
    }
    stats.setStatus(JobState.DONE);
    return JSON.stringify(stats, null, 2);
  }
}
