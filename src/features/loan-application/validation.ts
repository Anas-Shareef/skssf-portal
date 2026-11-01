import { OTHER_PURPOSE_VALUE } from './options';
import type { FilingMode, LoanApplicationDraft } from './types';

export const MIN_AMOUNT = 1000;
export const MAX_AMOUNT = 50000;
export const MIN_PURPOSE_DETAIL = 20;
export const MIN_INCOME = 1000;

export const ageFromDob = (value: string): number | null => {
  if (!value) return null;
  const dobDate = new Date(value);
  if (Number.isNaN(dobDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const m = today.getMonth() - dobDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age -= 1;
  return age;
};

const isPhone = (value: string) => /^\d{10}$/.test(value.trim());
const isPin = (value: string) => /^\d{6}$/.test(value.trim());

/**
 * Same rules as the original public form, step for step. Returns the first
 * problem found so the wizard can keep the user on the current step.
 */
export const validateStep = (step: number, draft: LoanApplicationDraft, mode: FilingMode): string | null => {
  if (step === 1) {
    if (!draft.fullName.trim() || draft.fullName.trim().length < 3) return 'Applicant Full Name is required (min 3 chars).';
    if (!draft.fatherName.trim() || draft.fatherName.trim().length < 3) return "Father's Name is required (min 3 chars).";
    if (!draft.dob) return 'Date of Birth is required.';
    const age = ageFromDob(draft.dob);
    if (age === null) return 'Please enter a valid Date of Birth.';
    if (age < 18) return 'Applicant must be at least 18 years old.';
    if (!isPhone(draft.phone)) return 'Please enter a valid 10-digit Phone Number.';
    if (!draft.sameWhatsapp && !isPhone(draft.whatsapp)) return 'Please enter a valid 10-digit WhatsApp Number.';
    if (!draft.addressHouse.trim()) return 'House Name / Number is required.';
    if (!draft.addressPlace.trim()) return 'Place / Area is required.';
    if (!draft.addressPost.trim()) return 'Post Office is required.';
    if (!isPin(draft.addressPin)) return 'Please enter a valid 6-digit PIN Code.';
  }

  if (step === 2) {
    const income = parseFloat(draft.monthlyIncome);
    if (Number.isNaN(income) || income < MIN_INCOME) return 'Please enter a valid monthly income amount (min ₹1,000).';
    if (draft.occupation === 'Other' && !draft.otherOccupation.trim()) return 'Please specify your occupation.';
    if (!draft.incomeSource.trim()) return 'Source of income is required.';
    if (draft.existingDebts && !draft.existingDebtsDetail.trim()) return 'Please provide details of existing debts.';
  }

  if (step === 3) {
    const amount = parseFloat(draft.amountRequested);
    if (Number.isNaN(amount) || amount < MIN_AMOUNT) return 'Loan amount must be at least ₹1,000.';
    if (amount > MAX_AMOUNT) return 'Requested amount exceeds branch maximum limit of ₹50,000.';
    if (draft.purposeCategory === OTHER_PURPOSE_VALUE && !draft.otherPurpose.trim()) return 'Please specify the loan purpose category.';
    if (!draft.purposeDetail.trim() || draft.purposeDetail.trim().length < MIN_PURPOSE_DETAIL) return 'Please describe the purpose in detail (min 20 characters).';
  }

  if (step === 4) {
    if (!draft.witness1Name.trim() || draft.witness1Name.trim().length < 3) return 'Witness/Guarantor 1 Name is required.';
    if (!isPhone(draft.witness1Phone)) return 'Please enter a valid 10-digit Phone number for Witness 1.';
    if (!draft.witness2Name.trim() || draft.witness2Name.trim().length < 3) return 'Witness/Guarantor 2 Name is required.';
    if (!isPhone(draft.witness2Phone)) return 'Please enter a valid 10-digit Phone number for Witness 2.';
  }

  if (step === 5) {
    if (!draft.confirmTruth || !draft.confirmSchedule) return 'You must accept both declaration confirmations before proceeding.';
  }

  if (step === 6 && mode === 'member') {
    if (!draft.memberRelationship.trim()) return 'Select your relationship to the applicant.';
    if (draft.memberNotes.trim().length < 20) return 'Member assessment notes must be at least 20 characters.';
  }

  return null;
};

/** Full check used by the server payload builder and the submit action. */
export const validateAll = (draft: LoanApplicationDraft, mode: FilingMode): string | null => {
  for (let step = 1; step <= 6; step += 1) {
    const error = validateStep(step, draft, mode);
    if (error) return error;
  }
  return null;
};
