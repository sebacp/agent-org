import { useEffect } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { readOrg } from "@/lib/library";

const Workspace = dynamic(() => import("@/components/Workspace"), {
  ssr: false,
  loading: () => <div className="h-screen w-full bg-canvas" />,
});

export default function OrgPage() {
  const router = useRouter();
  const { id } = router.query;

  const org = typeof id === "string" ? readOrg(id) : undefined;
  // A bookmark to a deleted company would otherwise resurrect it as a blank.
  const missing = org === null;
  // A company nobody finished naming has nothing to work on yet.
  const unset = Boolean(org && !org.company.name.trim());

  useEffect(() => {
    if (missing) void router.replace("/");
    else if (unset) void router.replace(`/org/${String(id)}/editar`);
  }, [id, missing, router, unset]);

  // `query` is empty until the router hydrates on the client.
  if (typeof id !== "string" || missing || unset) {
    return <div className="h-screen w-full bg-canvas" />;
  }

  return (
    <>
      <Head>
        <title>agent-org — {org?.company.name ?? "Empresa"}</title>
      </Head>
      <Workspace key={id} orgId={id} />
    </>
  );
}
