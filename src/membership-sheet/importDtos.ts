export class ImportPlayerDto {
  fullName: string;
  pdgaNumber: string;
  dob: Date;
  email: string;
  address: string;
  city: string;
}
export class ImportMembershipDto {
  validFrom: Date;
  validUntil: Date;
}
export class ImportPaymentDto {
  name: string;
  address: string;
  email: string;
  amount: string;
  confirmationCode: string;
  source: string;
  detail: string;
  date: string;
}
export class ImportDto {
  player: ImportPlayerDto;
  membership: ImportMembershipDto;
  payment: ImportPaymentDto;
}

// @2011-12-06  these are the columns of the BCDS membership spreadsheet.
// If they are changed, everything here will break.
export enum sheetColumn {
  transactionDate,
  name,
  dob,
  address,
  email,
  club,
  pdgaNumber,
  paymentReceived,
  paymentName,
  paymentAddress,
  paymentEmail,
  paymentTotal,
  paymentQuantity,
  billingAddress,
  city,
  province,
  country,
  purchaseDetail,
  purchaseType,
  confirmationCode,
  memo,
  locale,
  submissionSource,
}
