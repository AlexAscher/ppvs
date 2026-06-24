import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  getAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

/**
 * On-chain payout helper — sends USDC on Polygon from the platform pool wallet.
 *
 * Used by the card2crypto webhook to auto-forward the agency's 90% the moment a
 * sale lands in the pool. The private key (POOL_WALLET_PRIVATE_KEY) is read
 * from env, server-only; signing is local so the RPC never sees it.
 *
 * Safety:
 *   - Every send re-derives the sender address from the key and asserts it
 *     equals CARD2CRYPTO_POOL_ADDRESS — so a wrong/mistyped key can never send.
 *   - A hard MAX_SEND_USDC cap guards against a bug sending an absurd amount.
 *   - Idempotency lives at the caller (agency_auto_payouts unique(kind,code)).
 */

// USDC on Polygon PoS — 6 decimals.
const USDC_POLYGON = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" as const;
const USDC_DECIMALS = 6;

// Sanity cap: no single auto-payout above this (USD). A real PPV/tip is far
// below; anything larger means a bug — fail loudly instead of moving funds.
const MAX_SEND_USDC = 10_000;

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function rpcUrl(): string {
  const u = process.env.POLYGON_RPC_URL;
  if (!u) throw new Error("POLYGON_RPC_URL not configured");
  return u;
}

function normalizeKey(): Hex {
  const raw = (process.env.POOL_WALLET_PRIVATE_KEY ?? "").trim();
  if (!raw) throw new Error("POOL_WALLET_PRIVATE_KEY not configured");
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("POOL_WALLET_PRIVATE_KEY is not a 64-hex private key");
  }
  return hex as Hex;
}

/** The account derived from the configured private key. */
function senderAccount() {
  return privateKeyToAccount(normalizeKey());
}

/**
 * Address derived from POOL_WALLET_PRIVATE_KEY. The webhook logs whether this
 * matches CARD2CRYPTO_POOL_ADDRESS at boot/first use ("pool key OK ✓") without
 * ever logging the key.
 */
export function poolAddressFromKey(): string {
  return senderAccount().address;
}

/** True iff the configured key controls the configured pool address. */
export function poolKeyMatchesAddress(): boolean {
  try {
    const configured = process.env.CARD2CRYPTO_POOL_ADDRESS ?? "";
    return getAddress(poolAddressFromKey()) === getAddress(configured);
  } catch {
    return false;
  }
}

const publicClient = () =>
  createPublicClient({ chain: polygon, transport: http(rpcUrl()) });

/** Pool balances for the admin Wallet: USDC (spendable) + POL (gas). */
export async function getPoolBalances(): Promise<{ usdc: number; pol: number }> {
  const address = getAddress(process.env.CARD2CRYPTO_POOL_ADDRESS ?? "");
  const client = publicClient();
  const [usdcRaw, polRaw] = await Promise.all([
    client.readContract({
      address: USDC_POLYGON,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
    client.getBalance({ address }),
  ]);
  return {
    usdc: Number(formatUnits(usdcRaw as bigint, USDC_DECIMALS)),
    pol: Number(formatUnits(polRaw, 18)),
  };
}

/**
 * Send `amountUsdc` USDC to `to` on Polygon from the pool wallet.
 * Returns the transaction hash (does not wait for confirmation).
 * Throws if the key doesn't control the pool address, the amount is out of
 * range, or the pool's USDC balance is insufficient.
 */
export async function sendUsdc(to: string, amountUsdc: number): Promise<string> {
  if (!poolKeyMatchesAddress()) {
    throw new Error("pool key does not match CARD2CRYPTO_POOL_ADDRESS — refusing to send");
  }
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error("invalid payout amount");
  }
  if (amountUsdc > MAX_SEND_USDC) {
    throw new Error(`payout ${amountUsdc} exceeds safety cap ${MAX_SEND_USDC}`);
  }
  const toAddr = getAddress(to); // throws on a malformed address
  const value = parseUnits(amountUsdc.toFixed(USDC_DECIMALS), USDC_DECIMALS);

  // Guard against sending more than we hold (e.g. pool received a non-USDC
  // coin). The caller flags these for manual handling.
  const client = publicClient();
  const bal = (await client.readContract({
    address: USDC_POLYGON,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [getAddress(process.env.CARD2CRYPTO_POOL_ADDRESS ?? "")],
  })) as bigint;
  if (bal < value) {
    throw new Error("INSUFFICIENT_USDC: pool USDC balance below payout amount");
  }

  const wallet = createWalletClient({
    account: senderAccount(),
    chain: polygon,
    transport: http(rpcUrl()),
  });
  const hash = await wallet.writeContract({
    address: USDC_POLYGON,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toAddr, value],
  });
  return hash;
}
