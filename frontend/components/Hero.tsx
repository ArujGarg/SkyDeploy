import { Rocket } from "lucide-react";

export default function Hero() {
  return (
    <section className="text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-zinc-200 bg-white shadow-lg">
        <Rocket className="h-9 w-9 text-zinc-800" />
      </div>

      <h1 className="mt-8 text-6xl font-bold tracking-tight text-zinc-900">
        SkyDeploy
      </h1>

      <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-zinc-500">
        A lightweight deployment platform inspired by Render and Vercel. Deploy
        Dockerized GitHub repositories, monitor builds, inspect logs, and access
        live deployments through automatically generated URLs.
      </p>
    </section>
  );
}
