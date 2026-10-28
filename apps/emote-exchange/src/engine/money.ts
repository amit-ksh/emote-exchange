// Exact settlement in integer Price hundredths and fee basis points.
export function settlement(price: number, shares: number, fee: number) {
  const cents = Math.round(price * 100);
  if (
    !Number.isSafeInteger(cents) ||
    cents < 100 ||
    !Number.isSafeInteger(shares) ||
    shares < 1 ||
    shares > 1_000_000
  )
    throw new Error("Invalid settlement input.");
  const notional = BigInt(cents) * BigInt(shares);
  const denominator = 1_000_000n;
  const proportional = notional * BigInt(Math.round(fee * 10_000));
  const charge = proportional > denominator ? proportional : denominator;
  const debit = (notional * 10_000n + charge + denominator - 1n) / denominator;
  const proceeds = (notional * 10_000n - charge) / denominator;
  return { debit, proceeds: proceeds > 0n ? proceeds : 0n };
}
