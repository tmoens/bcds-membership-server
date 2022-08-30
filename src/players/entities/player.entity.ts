import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Membership } from '../../memberships/entities/membership.entity';

@Entity()
export class Player {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({
    nullable: true,
  })
  pdgaNumber: string;

  @Index()
  @Column()
  fullName: string;

  @Index()
  @Column({
    nullable: true,
  })
  aliases: string;

  @Column({
    nullable: true,
  })
  dob: Date;

  @Column({
    nullable: true,
  })
  email: string;

  @Column({
    nullable: true,
  })
  address: string;

  @Column({
    nullable: true,
  })
  city: string;

  @OneToMany((type) => Membership, (membership) => membership.player)
  memberships: Membership[];

  // keep track of a players aliases
  // returns true if an alias was added.
  aka(name): boolean {
    // If we already have the right name, nothing to do.
    if (this.fullName === name) {
      return false;
    }

    // otherwise if there are no aliases yet, add it
    if (!this.aliases) {
      this.aliases = name;
      return true;
    }

    // otherwise if the alias is already known, do nothing
    if (this.aliases.indexOf(name) >= 0) {
      return false;
    } else {
      // otherwise add the name to the list of aliases
      this.aliases = this.aliases.concat(`, ${name}`);
      return true;
    }
  }

  isKnownAs(nameOrAlias): boolean {
    if (this.fullName.toLowerCase() === nameOrAlias) {
      return true;
    }
    if (this.aliases && this.aliases.toLowerCase().indexOf(nameOrAlias) >= 0) {
      return true;
    }
    return false;
  }
}
