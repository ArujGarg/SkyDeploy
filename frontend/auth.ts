// auth.ts

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      authorization: {
        params: {
          scope: "read:user user:email",
        },
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token!;
        token.githubId = account.providerAccountId;

        token.name = profile.name;
        token.email = profile.email;
        // token.picture = profile.avatar_url;
        // token.login = profile.login;
      }

      return token;
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken;

      if (session.user) {
        session.user.id = token.githubId;
        session.user.login = token.login;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.image = token.picture;
      }

      return session;
    },
  },
});
