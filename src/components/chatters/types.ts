export type ChatterModel = {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
};

export type AgencyChatter = {
  id: string;
  chatter_id: string;
  chatter_email: string;
  model_id: string | null;
  model: ChatterModel | null;
  joined_at: string;
};

/** One row per chatter, aggregating all of their model assignments. */
export type AgencyChatterGroup = {
  chatter_id: string;
  chatter_email: string;
  joined_at: string;
  /** Assigned (non-null) model ids — a chatter can serve several models. */
  modelIds: string[];
};

export type Invitation = {
  id: string;
  agency_id: string;
  agency_name: string;
  chatter_email: string;
  chatter_id: string | null;
  model_id: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  model: ChatterModel | null;
};
