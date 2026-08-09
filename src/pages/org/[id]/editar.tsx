import { useEffect } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { readOrg } from "@/lib/library";

const OrgEditor = dynamic(() => import("@/components/OrgEditor"), {
  ssr: false,
  loading: () => <div className="h-screen w-full bg-canvas" />,
});

export default function OrgEditPage() {
  const router = useRouter();
  const { id } = router.query;
  const missing = typeof id === "string" && readOrg(id) === null;

  useEffect(() => {
    if (missing) void router.replace("/");
  }, [missing, router]);

  if (typeof id !== "string" || missing) {
    return <div className="h-screen w-full bg-canvas" />;
  }

  return (
    <>
      <Head>
        <title>agent-org — Organigrama</title>
      </Head>
      <OrgEditor key={id} orgId={id} />
    </>
  );
}
