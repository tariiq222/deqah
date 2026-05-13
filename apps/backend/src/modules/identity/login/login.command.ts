export interface LoginCommand {
  email: string;
  password: string;
  ip?: string;
  /** When the client already knows which org it wants, pass the organizationId here.
   *  If the user belongs to exactly one org or this resolves to a valid active
   *  membership, tokens are issued immediately. When omitted and the user has
   *  multiple memberships, the handler returns a requires_org_selection payload.
   *  When provided but NOT matched, the handler throws Unauthorized. */
  organizationId?: string;
}
