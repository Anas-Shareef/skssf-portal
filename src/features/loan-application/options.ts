/** Option lists shared by the public and member filing forms. */

export const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male / പുരുഷൻ' },
  { value: 'Female', label: 'Female / സ്ത്രീ' },
  { value: 'Other', label: 'Other / മറ്റ്' }
];

export const OCCUPATION_OPTIONS = [
  { value: 'Employee', label: 'Employee / ജീവനക്കാരൻ' },
  { value: 'Business', label: 'Business / വ്യാപാരി' },
  { value: 'Self-employed', label: 'Self-employed / സ്വയംതൊഴിൽ' },
  { value: 'Daily wage', label: 'Daily Wage / ദിനബത്ത' },
  { value: 'Driver', label: 'Driver / ഡ്രൈവർ' },
  { value: 'Farmer', label: 'Farmer / കർഷകൻ' },
  { value: 'Student', label: 'Student / വിദ്യാർത്ഥി' },
  { value: 'Other', label: 'Other / മറ്റ് തൊഴിൽ' }
];

export const PURPOSE_OPTIONS = [
  { value: 'Medical / ചികിത്സ', label: 'Medical Relief & Healthcare / ചികിത്സാ ധനസഹായം' },
  { value: 'Education / വിദ്യാഭ്യാസം', label: 'Educational Support / വിദ്യാഭ്യാസ ധനസഹായം' },
  { value: 'Marriage / വിവാഹം', label: 'Marriage Assistance / വിവാഹ ധനസഹായം' },
  { value: 'Housing / വീട്', label: 'Housing & Shelter Repair / വീട് നിർമ്മാണം/അറ്റകുറ്റപ്പണി' },
  { value: 'Business / ബിസിനസ്', label: 'Small Business & Livelihood / ചെറുകിട കച്ചവടം' },
  { value: 'Emergency / അടിയന്തര ആവശ്യം', label: 'Emergency Support / അടിയന്തര ആവശ്യം' },
  { value: 'Family Need / കുടുംബ ആവശ്യങ്ങൾ', label: 'Family Need / കുടുംബ ആവശ്യങ്ങൾ' },
  { value: 'Other / മറ്റ് ആവശ്യങ്ങൾ', label: 'Other Purpose / മറ്റ് ആവശ്യങ്ങൾ' }
];

export const OTHER_PURPOSE_VALUE = 'Other / മറ്റ് ആവശ്യങ്ങൾ';

export const REPAYMENT_MONTH_OPTIONS = ['1', '2', '3'];

export const WIZARD_STEPS = [
  { num: 1, title: 'Personal', sub: 'അപേക്ഷകൻ' },
  { num: 2, title: 'Employment', sub: 'തൊഴിൽ' },
  { num: 3, title: 'Loan Specs', sub: 'വായ്പ' },
  { num: 4, title: 'Guarantors', sub: 'സാക്ഷി' },
  { num: 5, title: 'Declaration', sub: 'ഒപ്പ്' },
  { num: 6, title: 'Review', sub: 'പരിശോധന' }
];

export const MEMBER_RELATIONSHIP_OPTIONS = [
  'Relative',
  'Neighbour',
  'Friend',
  'Community member',
  'Branch representative',
  'Other'
];
