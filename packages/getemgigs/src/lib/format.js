export function money(cents) {
  const n = (Number(cents) || 0) / 100;
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(n % 1 === 0 ? 0 : 2)}`;
}

export const STATUS_LABELS = {
  PROPOSED: 'Offer pending',
  ACTIVE: 'Deposits locked',
  SETTLED: 'Settled',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  PENDING: 'Not checked in',
  VERIFIED: 'Verified at venue',
  FORFEITED: 'No-show — forfeited',
};

export const LEDGER_LABELS = {
  STARTER_CREDIT: 'Starter credits',
  DEPOSIT_HOLD: 'Deposit locked',
  DEPOSIT_REFUND: 'Deposit refunded',
  FORFEIT_PAYOUT: 'No-show payout',
};
