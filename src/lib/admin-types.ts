// Shared admin API payload types. Kept in a bracket-free module so the client
// (AdminClient.tsx) can import them without referencing the dynamic-route
// segment path `…/agencies/[agencyId]/route` (mirrors fan-types.ts).
//
// Imported by:
//   - /api/admin/overview/route.ts
//   - /api/admin/agencies/route.ts
//   - /api/admin/agencies/[agencyId]/route.ts
//   - /components/admin/AdminClient.tsx

// ─── overview ─────────────────────────────────────────────────────────────
export type AdminTopAgency = { id: string; name: string; gmv: number; sales: number; fee: number };
export type AdminTopFan = {
  username: string | null;
  name: string;
  spent: number;
  agencyName: string;
  modelName: string;
};
export type AdminTopModel = { id: string; name: string; agencyName: string; gmv: number; sales: number };

export type AdminOverview = {
  gmvToday: number;
  gmvWeek: number;
  gmvMonth: number;
  gmvAllTime: number;
  platformRevenueToday: number;
  platformRevenueAllTime: number;
  agencyNetAllTime: number;
  feePct: number;
  sales: number;
  avgOrder: number;
  agencies: number;
  models: number;
  chatters: number;
  fans: number;
  payingFans: number;
  chart: { date: string; value: number }[];
  topAgencies: AdminTopAgency[];
  topFans: AdminTopFan[];
  topModels: AdminTopModel[];
  partial?: boolean;
};

// ─── agencies list ──────────────────────────────────────────────────────────
export type AdminAgencyRow = {
  id: string;
  name: string;
  email: string;
  payoutAddress: string | null;
  models: number;
  chatters: number;
  fans: number;
  gmv: number;
  fee: number;
  net: number;
  sales: number;
  lastActivity: string | null;
};
export type AdminAgenciesPayload = { agencies: AdminAgencyRow[]; partial?: boolean };

// ─── agency drill-down ────────────────────────────────────────────────────────
export type AdminAgencyModel = {
  id: string;
  name: string;
  gmv: number;
  sales: number;
  fans: number;
  sessionStatus: string | null;
};
export type AdminAgencyChatter = { id: string; name: string; gmv: number; sales: number };
export type AdminAgencyFan = {
  peerId: string;
  username: string | null;
  name: string;
  modelName: string;
  spent: number;
  lastSeen: string | null;
};
export type AdminAgencySale = {
  id: string;
  modelName: string;
  price: number;
  status: string;
  createdAt: string;
};
export type AdminAgencyPayout = { id: string; amount: number; status: string; createdAt: string };

export type AdminAgencyDetail = {
  id: string;
  name: string;
  email: string;
  payoutAddress: string | null;
  gmv: number;
  fee: number;
  net: number;
  sales: number;
  avgOrder: number;
  feePct: number;
  modelsCount: number;
  chattersCount: number;
  fansCount: number;
  payingFans: number;
  models: AdminAgencyModel[];
  chatters: AdminAgencyChatter[];
  topFans: AdminAgencyFan[];
  fans: AdminAgencyFan[];
  recentSales: AdminAgencySale[];
  payouts: AdminAgencyPayout[];
  partial?: boolean;
};
