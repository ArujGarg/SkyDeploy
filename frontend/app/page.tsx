import DeployForm from "@/components/DeployForm";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f8f9fb] text-zinc-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_50%)]" />

      <div className="relative mx-auto max-w-7xl px-6 py-20">
        <DeployForm />
      </div>
    </main>
  );
}
