import { ForbiddenException, Injectable } from '@nestjs/common';
import { getLogger } from 'log4js';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { JobStats } from '../helpers/jobstats';
import { fudgeDateToUtc } from '../helpers/fudge-date-to-utc';
import {
  ImportDto,
  ImportMembershipDto,
  ImportPaymentDto,
  ImportPlayerDto,
  sheetColumn,
} from './importDtos';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const logger = getLogger('membershipSheet');

@Injectable()
export class MembershipSheetService {
  lastLoad = 0;
  reloadLatency =
    this.configService.get('LATENCY_FOR_RELOAD_IN_SECONDS') * 1000;

  constructor(private configService: ConfigService) {}

  // Authentication required to read the spreadsheet.
  // It returns the spreadsheet manipulation API
  async authentication() {
    const auth = new google.auth.GoogleAuth({
      keyFile: this.configService.get('GOOGLE_APPLICATION_CREDENTIALS'),
      scopes: SCOPES,
    });

    const client = await auth.getClient().catch((err) => {
      const message = `Failed to authenticate to read BCDS spreadsheet: ${err}`;
      logger.fatal(message);
      throw new ForbiddenException(message);
    });

    const sheets = google.sheets({
      version: 'v4',
      auth: client,
    });
    return { sheets };
  }

  // read the membership sheet and parse it into data objects
  async loadSheet(stats: JobStats): Promise<ImportDto[] | null> {
    // Limit how often we reload from the BCDS spreadsheet
    if (new Date().valueOf() < this.lastLoad + this.reloadLatency) {
      logger.info('Reload requested in latency period.  No reload performed.');
      return null;
    }
    stats.setCurrentActivity(
      'Reading, parsing and validating membership worksheet',
    );
    const { sheets } = await this.authentication();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.configService.get('BCDS_MEMBERSHIP_SHEET'),
      range: 'Sheet1',
    });

    const rows: string[][] = response.data.values;

    const importDtos: ImportDto[] = [];

    // The first line of response data is the header line, which we do not use.
    rows.splice(0, 1);

    // Process each row on the spreadsheet
    // Each row represents a payment of a membership for a player
    // So, we are going to parse and validate the row into three data objects
    let rowNum = 1;
    stats.toDo = rows.length;
    for (let row of rows) {
      const player = new ImportPlayerDto();
      const membership = new ImportMembershipDto();
      const payment = new ImportPaymentDto();
      stats.bump('done'); // counting chickens before they are hatched a bit
      rowNum++;
      // trim whitespace from each column in the row
      row = row.map((item: string) => {
        if (item) {
          return item.trim();
        } else {
          return item;
        }
      });

      // -------------  PLAYER --------------------
      // The row must have a player name
      if (!row[sheetColumn.name]) {
        logger.error(`Row ${rowNum} has no player name.  Skipping it.`);
        stats.bump('missing name');
        stats.bump('rows skipped');
        continue;
      } else {
        player.fullName = row[sheetColumn.name].toLowerCase();
      }

      if (row[sheetColumn.pdgaNumber]) {
        const num = Number(row[sheetColumn.pdgaNumber]);
        if (num > 0 && num < 999999) {
          player.pdgaNumber = row[sheetColumn.pdgaNumber];
        } else {
          logger.error(
            `Invalid PDGA number for ${player.fullName}: ${
              row[sheetColumn.pdgaNumber]
            }`,
          );
          stats.bump('invalid PDGA number');
        }
      }

      if (row[sheetColumn.dob]) {
        player.dob = new Date(row[sheetColumn.dob]);
        if (Number.isNaN(player.dob.valueOf())) {
          logger.error(
            `Bad DOB for ${player.fullName}: ${row[sheetColumn.dob]}`,
          );
          stats.bump('invalid DOB');
          player.dob = null;
        } else {
          player.dob = fudgeDateToUtc(player.dob);
        }
      }
      if (row[sheetColumn.address]) {
        player.address = row[sheetColumn.address].toLowerCase();
      }
      if (row[sheetColumn.email]) {
        player.email = row[sheetColumn.email].toLowerCase();
      }
      if (row[sheetColumn.city]) {
        player.city = row[sheetColumn.city].toLowerCase();
      }
      // console.log(`Player: ${JSON.stringify(player)}`);

      // -------------  PAYMENT --------------------
      // The row must have a unique confirmation code
      // We can safely ignore any row that has a payment confirmation code that we
      // have already processed.
      // This assumes no one goes and edits data in the existing membership spreadsheet.
      if (!row[sheetColumn.confirmationCode]) {
        logger.error(
          `Missing confirmation code for ${player.fullName} row ${rowNum}. Skipping.`,
        );
        stats.bump('missing confirmation code');
        stats.bump('rows skipped');
        continue;
      } else {
        payment.confirmationCode = row[sheetColumn.confirmationCode];
      }

      // The row must have a transaction date
      let transactionDate: Date;
      if (!row[sheetColumn.transactionDate]) {
        stats.bump('missing transaction date');
        logger.error(
          `Missing transaction date for ${row[sheetColumn.name]}: Skipping.`,
        );
        stats.bump('rows skipped');
        continue;
      } else {
        transactionDate = new Date(row[sheetColumn.transactionDate]);
        if (Number.isNaN(transactionDate.valueOf())) {
          logger.error(
            `Transaction date for ${row[sheetColumn.name]} is invalid: ${
              row[sheetColumn.transactionDate]
            }. Skipping.`,
          );
          stats.bump('invalid transaction date');
          stats.bump('rows skipped');
          continue;
        }
      }
      payment.date = transactionDate.toISOString();
      if (row[sheetColumn.paymentName]) {
        payment.name = row[sheetColumn.paymentName];
      }
      if (row[sheetColumn.paymentAddress]) {
        payment.address = row[sheetColumn.paymentAddress];
      }
      if (row[sheetColumn.paymentEmail]) {
        payment.email = row[sheetColumn.paymentEmail];
      }
      if (row[sheetColumn.paymentTotal]) {
        payment.amount = row[sheetColumn.paymentTotal];
      }
      if (row[sheetColumn.submissionSource]) {
        payment.source = row[sheetColumn.submissionSource];
      }
      if (row[sheetColumn.purchaseDetail]) {
        payment.detail = row[sheetColumn.purchaseDetail];
      }
      // console.log(`Payment: ${JSON.stringify(payment)}`);

      // -------------  MEMBERSHIP --------------------
      membership.validFrom = transactionDate;
      let endYear = transactionDate.getFullYear();
      if (transactionDate.getMonth() >= 9) {
        endYear++;
      }
      membership.validUntil = new Date(endYear, 11, 31);
      // console.log(`Membership: ${JSON.stringify(membership)}`);

      const importDto: ImportDto = new ImportDto();
      importDto.payment = payment;
      importDto.player = player;
      importDto.membership = membership;
      importDtos.push(importDto);
      stats.bump('row validated successfully');
    }
    this.lastLoad = new Date().valueOf();
    return importDtos;
  }
}
