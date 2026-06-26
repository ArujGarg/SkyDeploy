"use client";

import { signOut, useSession } from "next-auth/react";
import Image from "next/image";

export default function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      {session.user.image && (
        <Image
          src={session.user.image!}
          alt={session.user.name ?? "User"}
          width={36}
          height={36}
          className="rounded-full border"
        />
      )}

      <div className="flex flex-col">
        <span className="text-sm font-medium">{session.user.name}</span>

        <span className="text-xs text-neutral-500">@{session.user.login}</span>
      </div>

      <button
        onClick={async () => {
          await signOut({
            redirectTo: "/",
          });
        }}
        className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-100"
      >
        Sign Out
      </button>
    </div>
  );
}
