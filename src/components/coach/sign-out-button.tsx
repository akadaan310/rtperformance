import { LogOut } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className={buttonClass("ghost", "sm", compact ? "w-full justify-start" : undefined)}>
        <LogOut className="size-4" aria-hidden /> Sign out
      </button>
    </form>
  );
}
