import { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { GlobalHead } from "./GlobalHead";
import Layout from "./Layout";
import LoadingView from "./LoadingView";

export default function Auth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  if (status === "loading") {
    return <LoadingView />;
  } else if (status === "unauthenticated") {
    router.push("/").then();
    return (
      <>
        <GlobalHead />
        <Layout>
          <main className="flex h-full w-full flex-col justify-center text-center">
            <h1 className="text-5xl font-bold">Redirecting...</h1>
          </main>
        </Layout>
      </>
    );
  }

  return <>{children}</>;
}
