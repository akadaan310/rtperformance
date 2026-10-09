#!/usr/bin/env node
/**
 * Authorized provisioning of the master (network) workspace and its owner — the ONLY way to create the
 * platform owner. Run by an operator with the service-role key; never exposed to the app.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/provision-owner.mjs --email raymond@example.com --name "RT Performance" --slug rt-performance
 *
 * The owner must first create their account at /signup (so no password ever passes through this script).
 * Re-running is safe: it ensures the membership exists and never creates a second master workspace.
 */
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!args.email || !args.slug) {
  console.error('Usage: node scripts/provision-owner.mjs --email owner@example.com --slug rt-performance [--name "RT Performance"]');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.rpc("provision_master_workspace", {
  p_email: args.email,
  p_name: args.name ?? "RT Performance",
  p_slug: args.slug,
});
if (error) {
  console.error("Provisioning failed:", error.message);
  process.exit(1);
}
console.log(`Master workspace ready (id ${data}). ${args.email} is the network owner. Sign in and open /w/${args.slug}.`);
