import { SignIn } from "@clerk/nextjs";
import { BrandPanel } from "@/components/brand-panel";
import { Logo } from "@/components/logo";

export default function SignInPage() {
  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-2">
      <div className="hidden bg-navy-900 px-10 py-12 lg:flex lg:px-14">
        <BrandPanel />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo />
          </div>

          <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy-900">
            Welcome back
          </h1>
          <p className="mt-1 text-zinc-500">Sign in to access your quiz dashboard</p>

          <div className="mt-8">
            <SignIn
              appearance={{
                variables: {
                  colorPrimary: "#14294c",
                  borderRadius: "0.75rem",
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
