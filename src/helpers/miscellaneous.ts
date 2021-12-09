export function pdgaNumberFromString(pdgaNumberAsString: string): number {
  let pdgaNumber: number = null;
  if (pdgaNumberAsString) {
    pdgaNumber = Number(pdgaNumberAsString);
    if (isNaN(pdgaNumber) || 1 > pdgaNumber || 9999999 < pdgaNumber) {
      pdgaNumber = null;
    }
  }
  return pdgaNumber;
}
