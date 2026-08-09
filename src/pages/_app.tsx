import "@xyflow/react/dist/style.css";
import "@/styles/globals.css";
import { ReactFlowProvider } from "@xyflow/react";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ReactFlowProvider>
      <Component {...pageProps} />
    </ReactFlowProvider>
  );
}
