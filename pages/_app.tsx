import type { AppProps } from "next/app";
import "../styles/globals.css";
import { WorkspaceProvider } from "../components/Workspace";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WorkspaceProvider>
      <Component {...pageProps} />
    </WorkspaceProvider>
  );
}
