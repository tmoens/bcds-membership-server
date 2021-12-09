import { Injectable } from '@nestjs/common';
import { getLogger } from 'log4js';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { PdgaTournamentData } from '../dtos/pdga-tournament-data';
import { PdgaPlayerData } from '../dtos/pdga-player-data';
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const logger = getLogger('pdgaApi');
const pdgaURL = 'https://api.pdga.com/services/json';

@Injectable()
export class PdgaApiService {
  token = '';
  sessionName = '';
  sessionId = '';

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.login();
  }

  async login() {
    logger.info(`Logging into PDGA API.`);
    const password = this.configService.get('PDGA_API_PASSWORD');
    const response: any = await lastValueFrom(
      this.httpService.post(`${pdgaURL}/user/login`, {
        username: this.configService.get('PDGA_API_USER'),
        password: this.configService.get('PDGA_API_PASSWORD'),
      }),
    );
    this.token = response.data.token;
    this.sessionId = response.data.sessid;
    this.sessionName = response.data.session_name;
    // console.log(`Logging in to PDGA API: ${JSON.stringify(response.data)}`);
  }

  async getTournamentData(tournamentId): Promise<PdgaTournamentData | null> {
    const response = await lastValueFrom(
      this.httpService.get(
        `${pdgaURL}/event?tournament_id=${String(tournamentId)}`,
        {
          headers: {
            Cookie: `${this.sessionName}=${this.sessionId}`,
          },
        },
      ),
    );
    // console.log(`Tournament Data: ${JSON.stringify(response.data, null, 2)}`);
    if (
      response.data &&
      response.data.events &&
      response.data.events.length > 0
    ) {
      return response.data.events[0] as PdgaTournamentData;
    } else {
      return null;
    }
  }

  async getPlayerData(pdgaNumber): Promise<PdgaPlayerData> {
    const response = await lastValueFrom(
      this.httpService.get(
        `${pdgaURL}/players?pdga_number=${String(pdgaNumber)}`,
        {
          headers: {
            Cookie: `${this.sessionName}=${this.sessionId}`,
          },
        },
      ),
    );
    // console.log(`Tournament Data: response.data`);
    return response.data as PdgaPlayerData;
  }

  // retrieve all the players in a tournament.
  // Unfortunately the pdga does not provide an API for this,
  // So, we load the tournament web page and scrape the players out of that HTML
  //
  // In the tournament HTML, player elements with a pdga number are like this
  // <td class='player'>
  //   <a href="/player/89924" class="tooltip tooltipstered" data-tooltip-content="#player-details-89924">Ted Moens</a>
  // </td>
  //
  // players elements *without* a pdga number are in an element like this
  // <td class='player'>Maria Jacobs</td>
  async getTournamentPlayers(tournamentId: string): Promise<PdgaPlayerMini[]> {
    const players: PdgaPlayerMini[] = [];
    const tournamentWebPage = await lastValueFrom(
      this.httpService.get(`https://www.pdga.com/tour/event/${tournamentId}`),
    );

    const dom = new JSDOM(tournamentWebPage.data);

    // Conveniently, all the player information is in the set of elements that
    // have the 'player' class, so let's grab them all with one dom query.
    const playerElements: HTMLElement[] =
      dom.window.document.getElementsByClassName('player');

    for (const playerElement of playerElements) {
      const player: PdgaPlayerMini = new PdgaPlayerMini();

      // check which case by trying to find an <a></a> selector in the element.
      const playerElementWithPdgaNumber = playerElement.querySelector('a');

      if (playerElementWithPdgaNumber) {
        // player element has PDGA number.
        // See if we know the player, if not add them to our db.
        player.pdgaNumber = playerElementWithPdgaNumber.href.substring(8);
        player.name = playerElementWithPdgaNumber.text.toLowerCase();
      } else {
        // player element *does not have* a PDGA number.
        player.name = playerElement.textContent.toLowerCase();
      }
      players.push(player);
    }
    return players;
  }
}

export class PdgaPlayerMini {
  name: string;
  pdgaNumber: string = null;
}
