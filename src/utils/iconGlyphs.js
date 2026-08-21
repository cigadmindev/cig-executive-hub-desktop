// Categories already carry the exact Ionicons name mobile uses
// (data/mockData.js) — this maps those same names to the matching icon
// in the local Icon component, so category data doesn't need a second,
// desktop-specific icon choice duplicated alongside it.
const IONICON_TO_ICON = {
  'settings-outline': 'gear',
  'cash-outline': 'cash',
  'cube-outline': 'box',
  'restaurant-outline': 'utensils',
  'people-outline': 'people',
  'megaphone-outline': 'megaphone',
  'build-outline': 'wrench',
  'hammer-outline': 'hammer',
  'clipboard-outline': 'clipboard',
  'hardware-chip-outline': 'cpu',
  'archive-outline': 'archive',
  'sparkles-outline': 'sparkles',
  'document-text-outline': 'document',
  'rocket-outline': 'rocket',
  'call-outline': 'phone',
  'git-network-outline': 'network',
  'lock-closed-outline': 'lock',
};

export function iconName(ioniconName) {
  return IONICON_TO_ICON[ioniconName] ?? 'document';
}
