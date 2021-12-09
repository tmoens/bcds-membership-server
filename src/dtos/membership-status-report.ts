import { PdgaTournamentData } from './pdga-tournament-data';
import { MembershipState } from './membership-state';

export class BcdsTournamentMembershipReport {
  tournamentData?: PdgaTournamentData | null = null;
  players: BdcsMemberMini[] = [];
}

export class BdcsMemberMini {
  name: string;
  pdgaNumber?: string;
  state: MembershipState = MembershipState.PLAYER_NOT_KNOWN;
  note?: string;
}

