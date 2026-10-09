/**
 * Application-level permission model. This mirrors (and never replaces) the database RLS policies:
 * server code checks `can()` before doing work so users get clear errors, and the database enforces
 * the same boundaries independently.
 */
export type Role = "owner" | "trainer" | "athlete";

export type Permission =
  | "athletes.read"
  | "athletes.write"
  | "athletes.delete"
  | "athletes.invite"
  | "notes.read"
  | "notes.write"
  | "programs.read"
  | "programs.write"
  | "programs.publish"
  | "programs.assign"
  | "exercises.write"
  | "workouts.log_any"
  | "workouts.log_self"
  | "goals.write"
  | "brand.read"
  | "brand.write"
  | "team.read"
  | "team.manage"
  | "audit.read"
  | "assistant.use"
  | "network.manage";

const COACH: Permission[] = [
  "athletes.read",
  "athletes.write",
  "athletes.invite",
  "notes.read",
  "notes.write",
  "programs.read",
  "programs.write",
  "programs.publish",
  "programs.assign",
  "exercises.write",
  "workouts.log_any",
  "goals.write",
  "brand.read",
  "team.read",
  "assistant.use",
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([...COACH, "athletes.delete", "brand.write", "team.manage", "audit.read"]),
  trainer: new Set<Permission>(COACH),
  athlete: new Set<Permission>(["workouts.log_self", "brand.read"]),
};

export interface Principal {
  role: Role;
  /** True only for an active owner of the single master (network) organization. */
  isMasterOwner: boolean;
  /** True when the current workspace is the master organization. */
  workspaceIsMaster: boolean;
}

export function can(principal: Principal, permission: Permission): boolean {
  if (permission === "network.manage") {
    return principal.isMasterOwner && principal.workspaceIsMaster && principal.role === "owner";
  }
  return MATRIX[principal.role].has(permission);
}

export function isCoachRole(role: Role): boolean {
  return role === "owner" || role === "trainer";
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertCan(principal: Principal, permission: Permission, message?: string): void {
  if (!can(principal, permission)) throw new AuthorizationError(message);
}
