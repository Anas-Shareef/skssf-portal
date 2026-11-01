import { OTHER_PURPOSE_VALUE } from './options';
import type { FilingMode, LoanApplicationDraft } from './types';

export const composeAddress = (draft: LoanApplicationDraft) =>
  `${draft.addressHouse.trim()}, ${draft.addressPlace.trim()}, ${draft.addressPost.trim()} P.O., ${draft.addressDistrict} - ${draft.addressPin.trim()}`;

export const finalCategory = (draft: LoanApplicationDraft) =>
  draft.purposeCategory === OTHER_PURPOSE_VALUE ? `Other: ${draft.otherPurpose.trim()}` : draft.purposeCategory;

export const finalOccupation = (draft: LoanApplicationDraft) =>
  draft.occupation === 'Other' ? `Other: ${draft.otherOccupation.trim()}` : draft.occupation;

export const monthlyInstalment = (draft: LoanApplicationDraft) => {
  const amount = parseFloat(draft.amountRequested) || 0;
  const months = parseInt(draft.repaymentMonths) || 3;
  return amount > 0 ? Math.round(amount / months) : 0;
};

/**
 * Builds the request body for `POST /api/submit-loan-application`.
 *
 * Both modes send the same applicant, loan and witness fields. The member mode
 * additionally carries the authenticated filing context; the server derives the
 * member identity from the bearer token, never from this body.
 */
export const buildSubmissionPayload = (draft: LoanApplicationDraft, mode: FilingMode) => {
  const address = composeAddress(draft);
  const category = finalCategory(draft);
  const occupation = finalOccupation(draft);
  const amount = parseFloat(draft.amountRequested);
  const months = parseInt(draft.repaymentMonths);

  const summary = [
    `Father: ${draft.fatherName.trim()}`,
    `Category: ${category}`,
    `Details: ${draft.purposeDetail.trim()}`,
    `Period: ${months} Months`,
    `Occupation: ${occupation} (${draft.employerName ? draft.employerName.trim() : 'N/A'})`,
    `Income: ₹${draft.monthlyIncome} (${draft.incomeSource.trim()})`,
    `Debts: ${draft.existingDebts ? draft.existingDebtsDetail.trim() : 'None'}`,
    `Witness 1: ${draft.witness1Name.trim()} (${draft.witness1Phone.trim()})`,
    `Witness 2: ${draft.witness2Name.trim()} (${draft.witness2Phone.trim()})`,
    `DOB: ${draft.dob} (${draft.gender})`
  ].join('\n');

  return {
    mode: mode === 'member' ? 'member_direct' : undefined,
    is_public_referral: mode === 'public',
    applicant_name: draft.fullName.trim(),
    applicant_phone: draft.phone.trim(),
    applicant_address: address,
    amount,
    months,
    purpose: summary,
    loan_purpose_category: category,
    loan_purpose_detail: draft.purposeDetail.trim(),
    father_name: draft.fatherName.trim(),
    dob: draft.dob,
    gender: draft.gender,
    whatsapp: draft.sameWhatsapp ? draft.phone.trim() : draft.whatsapp.trim() || null,
    address_house: draft.addressHouse.trim(),
    address_place: draft.addressPlace.trim(),
    address_post: draft.addressPost.trim(),
    address_pin: draft.addressPin.trim(),
    address_district: draft.addressDistrict,
    occupation,
    employer_name: draft.employerName.trim() || null,
    income_source: draft.incomeSource.trim(),
    monthly_income: parseFloat(draft.monthlyIncome) || null,
    existing_debts: draft.existingDebts,
    existing_debts_detail: draft.existingDebts ? draft.existingDebtsDetail.trim() : null,
    witness1_name: draft.witness1Name.trim(),
    witness1_phone: draft.witness1Phone.trim(),
    witness1_member_no: draft.witness1MemNo.trim() || null,
    witness1_relationship: draft.witness1Relationship.trim() || null,
    witness2_name: draft.witness2Name.trim(),
    witness2_phone: draft.witness2Phone.trim(),
    witness2_member_no: draft.witness2MemNo.trim() || null,
    witness2_relationship: draft.witness2Relationship.trim() || null,
    confirm_truth: draft.confirmTruth,
    confirm_schedule: draft.confirmSchedule,
    relationship: mode === 'member' ? draft.memberRelationship.trim() : undefined,
    member_notes: mode === 'member' ? draft.memberNotes.trim() : undefined
  };
};
