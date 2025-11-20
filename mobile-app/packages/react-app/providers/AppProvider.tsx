// providers/AppProvider.tsx
"use client";

import React, { ReactNode, useEffect } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { useConnect } from "wagmi"; // <-- THIS IS THE FIX
import { injected } from "wagmi/connectors";
import { celo, celoSepolia } from "wagmi/chains"; 
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 1. Create the correct config
export const config = createConfig({
  chains: [celo, celoSepolia], 
  connectors: [
    injected(), 
  ],
  transports: {
    [celo.id]: http(),
    [celoSepolia.id]: http(),
  },
});

// 2. Create a QueryClient
const queryClient = new QueryClient();

// 3. Create a component to auto-connect
function AutoConnector({ children }: { children: ReactNode }) {
  const { connect, connectors } = useConnect();

  useEffect(() => {
    if (window.ethereum && (window.ethereum as any).isMiniPay) {
      connect({ connector: connectors[0] });
    }
  }, [connect, connectors]);

  return <>{children}</>;
}

// 4. Create the main provider
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AutoConnector>{children}</AutoConnector>
      </QueryClientProvider>
    </WagmiProvider>
  );
}