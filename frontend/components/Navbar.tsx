"use client";

import { useSession } from "next-auth/react";
import LoginButton from "./auth/LoginButton";
import UserMenu from "./auth/UserMenu";

export default function Navbar() {
  const { status } = useSession();

  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <h1 className="text-xl font-bold">SkyDeploy</h1>

        {status === "authenticated" ? <UserMenu /> : <LoginButton />}
      </div>
    </header>
  );
}
