// "workplace" is the stored value for a business, so older accounts keep working.
export const ORG_TYPES = [
  { value: 'workplace', label: 'Business', hint: 'Staff clock in and out' },
  { value: 'school', label: 'School', hint: 'Students mark class attendance' },
  { value: 'government', label: 'Government office (Ministry, Department or Agency)', hint: 'Civil servants clock in and out' },
];
export const typeLabel = (t) => ORG_TYPES.find((x) => x.value === t)?.label.split(' (')[0] || 'Business';
