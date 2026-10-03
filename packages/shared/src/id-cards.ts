/** ID cards for students and staff, printed on A4 sheets. */

export type IdCardKind = "student" | "staff";

export type IdCardPerson = {
  id: string;
  name: string;
  /** The class and roll number, or the job title. */
  subtitle: string;
  /** Admission number or employee number: what the card's QR code holds. */
  number: string;
  hasPhoto: boolean;
};

export type IdCardList = { kind: IdCardKind; label: string; people: IdCardPerson[]; withoutPhoto: number; validUntil: string | null };

export const MAX_CARDS_PER_PRINT = 400;
