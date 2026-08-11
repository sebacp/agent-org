import dynamic from "next/dynamic";
import Head from "next/head";

// The library reads localStorage during initialization, so it never renders on
// the server.
const Library = dynamic(() => import("@/components/Library"), {
  ssr: false,
  loading: () => <div className="h-screen w-full bg-canvas" />,
});

export default function Home() {
  return (
    <>
      <Head>
        <title>agent-org — Tus empresas</title>
        <meta
          name="description"
          content="Diseñá y conectá una empresa entera de agentes de IA."
        />
      </Head>
      <Library />
    </>
  );
}
