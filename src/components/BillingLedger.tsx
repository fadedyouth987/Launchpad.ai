import React from 'react';
import { useBillingLedger, type BillingLedgerProps } from './billing/useBillingLedger';
import { BillingOverview } from './billing/BillingOverview';
import { CreditTrendChart } from './billing/CreditTrendChart';
import { LedgerTable } from './billing/LedgerTable';

/** Billing & Ledger: balance overview, credit consumption trend charts and the immutable ledger. */
export const BillingLedger: React.FC<BillingLedgerProps> = (props) => {
  const s = useBillingLedger(props);
  return (
    <div className="space-y-8 w-full">
      <BillingOverview s={s} />
      <CreditTrendChart s={s} />
      <LedgerTable s={s} />
    </div>
  );
};
