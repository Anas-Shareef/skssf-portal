/**
 * Shared loan application model.
 *
 * The public referral form (`/request/:code/apply`) and the member filing page
 * (`/member/dashboard/filed-loans/new`) render the same wizard and use the same
 * validation. Only the submission context differs.
 */

export type FilingMode = 'public' | 'member';

export type LoanApplicationDraft = {
  // Section A — personal details
  fullName: string;
  fatherName: string;
  dob: string;
  gender: string;
  phone: string;
  sameWhatsapp: boolean;
  whatsapp: string;
  addressHouse: string;
  addressPlace: string;
  addressPost: string;
  addressPin: string;
  addressDistrict: string;

  // Section A — employment and financials
  occupation: string;
  otherOccupation: string;
  employerName: string;
  monthlyIncome: string;
  incomeSource: string;
  existingDebts: boolean;
  existingDebtsDetail: string;

  // Section B — loan specifications
  amountRequested: string;
  purposeCategory: string;
  otherPurpose: string;
  purposeDetail: string;
  repaymentMonths: string;

  // Section C — witnesses (exactly two)
  witness1Name: string;
  witness1Phone: string;
  witness1MemNo: string;
  witness1Relationship: string;
  witness2Name: string;
  witness2Phone: string;
  witness2MemNo: string;
  witness2Relationship: string;

  // Declarations
  confirmTruth: boolean;
  confirmSchedule: boolean;

  // Member filing context (member mode only; never replaces the applicant)
  memberRelationship: string;
  memberNotes: string;
};

export type WitnessLink = {
  index: number;
  name: string | null;
  phone: string | null;
  url: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
};

export type SubmitOutcome = {
  reference: string;
  requestId?: string | null;
  loanId?: string | null;
  witnesses?: WitnessLink[];
  witnessVerificationAvailable?: boolean;
  /** Applicant name as submitted; used for witness WhatsApp messages. */
  applicantName?: string;
};

export const emptyDraft: LoanApplicationDraft = {
  fullName: '',
  fatherName: '',
  dob: '',
  gender: 'Male',
  phone: '',
  sameWhatsapp: true,
  whatsapp: '',
  addressHouse: '',
  addressPlace: '',
  addressPost: '',
  addressPin: '',
  addressDistrict: 'Kannur',

  occupation: 'Employee',
  otherOccupation: '',
  employerName: '',
  monthlyIncome: '',
  incomeSource: '',
  existingDebts: false,
  existingDebtsDetail: '',

  amountRequested: '',
  purposeCategory: 'Medical / ചികിത്സ',
  otherPurpose: '',
  purposeDetail: '',
  repaymentMonths: '3',

  witness1Name: '',
  witness1Phone: '',
  witness1MemNo: '',
  witness1Relationship: '',
  witness2Name: '',
  witness2Phone: '',
  witness2MemNo: '',
  witness2Relationship: '',

  confirmTruth: false,
  confirmSchedule: false,

  memberRelationship: '',
  memberNotes: ''
};
