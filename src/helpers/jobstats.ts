import { getLogger } from 'log4js';

/*
 * A very small object to track the status of long running jobs.
 * By keeping one of these up to date, the server can answer
 * client polling for the status of a job.
 *
 * Used for things like uploading big player spreadsheets
 * or building reports for the client.
 */

const logger = getLogger('jobstats');

export class JobStats {
  name: string;
  startTime: Date;
  endTime: Date;
  status: JobState;
  currentActivity: string;
  history: string[] = [];
  toDo: number;
  // anything the client wants to remember about the job
  data: any = {};
  counters: any = {};
  percentComplete?: number;

  constructor(name: string) {
    this.name = name;
    this.startTime = new Date();
    this.status = JobState.NOT_STARTED;
    this.toDo = -1; // If it is -1 it is not known yet.
  }

  bump(counterName: string, amount = 1): number {
    if (null == this.counters[counterName]) {
      this.counters[counterName] = amount;
    } else {
      this.counters[counterName] = this.counters[counterName] + amount;
    }
    if (counterName === 'done' && this.toDo > 0) {
      this.percentComplete = Math.trunc((this.counters.done / this.toDo) * 100);
    }
    return this.counters[counterName];
  }

  setCounter(counterName: string, amount = 1): number {
    this.counters[counterName] = amount;
    if (counterName === 'done' && this.toDo > 0) {
      this.percentComplete = Math.trunc((this.counters.done / this.toDo) * 100);
    }
    return this.counters[counterName];
  }

  get(counterName: string): number {
    if (null == this.counters[counterName]) {
      return -1;
    } else {
      return this.counters[counterName];
    }
  }

  getCounters(): any {
    return this.counters;
  }

  setStatus(state: JobState) {
    this.status = state;
    if (JobState.DONE === state) {
      this.endTime = new Date();
      logger.info(
        `Job ${this.name} complete: ` + JSON.stringify(this, null, 2),
      );
    }
    if (JobState.ERROR === state) {
      this.endTime = new Date();
      logger.error(`Job ${this.name} failed: ` + JSON.stringify(this, null, 2));
    }
  }

  setData(name: string, whatever: any) {
    this.data[name] = whatever;
  }

  getHistory(): string[] {
    return this.history;
  }

  addNote(note: string) {
    this.history.push(new Date().toISOString() + ' ' + note);
  }

  setCurrentActivity(activity: string) {
    this.currentActivity = activity;
    this.addNote(activity);
  }

  // Merge one set of stats with another
  // For now just add in the others history and counters.
  merge(other: JobStats) {
    this.history.concat(other.getHistory());
    const otherCounters = other.getCounters();
    for (const name of Object.keys(otherCounters)) {
      this.bump(name, otherCounters[name]);
    }
  }
}

export enum JobState {
  NOT_STARTED = 'Not Started',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
  ERROR = 'Error',
}
