// Build broken copies from real HTTP responses, never from static snapshots.
export function offerBreakageCases(offer: Record<string, unknown>) {
  const missingVersion = { ...offer };
  delete missingVersion.version;
  return [
    { label: 'numeric price', offer: { ...offer, price: 89 }, expectedDiagnostics: ['/0/price must be string'] },
    { label: 'string stock', offer: { ...offer, stock: '8' }, expectedDiagnostics: ['/0/stock must be integer'] },
    { label: 'missing version', offer: missingVersion, expectedDiagnostics: ['required property', 'version'] },
    { label: 'forbidden null', offer: { ...offer, productName: null }, expectedDiagnostics: ['/0/productName must be string'] },
  ];
}

export function orderBreakageCases(order: Record<string, unknown>) {
  const missingDate = { ...order };
  delete missingDate.exchangeRateDate;
  return [
    { label: 'numeric total', body: { ...order, total: 765.4 }, expectedDiagnostics: ['/total must be string'] },
    { label: 'missing exchange rate date', body: missingDate, expectedDiagnostics: ['exchangeRateDate', 'required property'] },
  ];
}
