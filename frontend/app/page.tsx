import CreateProjectForm from "@/components/CreateProjectForm";
import Hero from "@/components/Hero";
import ProjectList from "@/components/ProjectList";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f8f9fb]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_50%)]" />

      <div className="relative mx-auto max-w-7xl px-6 py-16">
        <Hero />

        <div className="mt-12">
          <CreateProjectForm />
        </div>

        <div className="mt-16">
          <ProjectList />
        </div>
      </div>
    </main>
  );
}
