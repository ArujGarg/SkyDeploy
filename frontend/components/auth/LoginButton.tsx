"use client";

import { signIn } from "next-auth/react";

export default function LoginButton() {
  return (
    <button
      onClick={() => {
        console.log("clicked");
        signIn("github");
      }}
    >
      Sign In
    </button>
  );
}
