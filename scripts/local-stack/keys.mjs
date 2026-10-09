// Prints local anon / service-role JWTs signed with the local stack secret (development only).
import { SignJWT } from "jose";
const secret = new TextEncoder().encode(process.env.LOCAL_JWT_SECRET ?? "local-dev-jwt-secret-not-for-production-use-0001");
const sign = (role) =>
  new SignJWT({ role, iss: "supabase-local" }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(1700000000).setExpirationTime(4102444800).sign(secret);
console.log(`\nLocal stack ready:\n  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n  NEXT_PUBLIC_SUPABASE_ANON_KEY=${await sign("anon")}\n  SUPABASE_SERVICE_ROLE_KEY=${await sign("service_role")}\n`);
