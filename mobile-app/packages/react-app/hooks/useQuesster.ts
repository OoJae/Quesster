import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { 
  keccak256, toBytes, erc20Abi, Address, encodeFunctionData, 
  createWalletClient, custom, parseUnits 
} from "viem";
// We use 'celo' for Mainnet
import { celo } from "viem/chains"; 
import { useState } from "react";

import CeloQuestAbi from './CeloQuest.json'; 
import QuessterBadgesAbi from './QuessterBadges.json';

// --- 1. MAINNET GAME ADDRESS ---
const QUESSTER_GAME_ADDRESS = "0xb1aAe9a1480c685375fcBC5072Ccc9f3EFd5c51C" as Address;

// --- 2. MAINNET BADGE ADDRESS ---
const QUESSTER_BADGES_ADDRESS = "0x6F9fb4a3BdeB7391E0Fb035365f21433E2595c1C" as Address; 

// --- 3. MAINNET cUSD ADDRESS (18 Decimals) ---
const CUSD_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as Address;

// --- 4. MAINNET FEE (18 Decimals) ---
const ENTRY_FEE = parseUnits("0.1", 18); // 0.1 cUSD

export const useQuesster = () => {
  const { address, chainId } = useAccount(); 
  
  const { writeContractAsync: approveAsync, isPending: isApprovePending, error: approveError } = useWriteContract();
  
  const [isJoinPending, setIsJoinPending] = useState(false);
  const [joinError, setJoinError] = useState<Error | null>(null);
  const [isMintingBadge, setIsMintingBadge] = useState(false); 

  // READS
  const { data: hasJoined, refetch: refetchHasJoined } = useReadContract({
    address: QUESSTER_GAME_ADDRESS,
    abi: CeloQuestAbi.abi,
    functionName: 'hasJoinedCurrentQuest',
    args: [address!],
    query: { enabled: !!address, gcTime: 0, staleTime: 0 }
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CUSD_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, QUESSTER_GAME_ADDRESS], 
    query: { enabled: !!address, gcTime: 0, staleTime: 0 },
  });

  const { data: badgeBalance, refetch: refetchBadge } = useReadContract({
    address: QUESSTER_BADGES_ADDRESS,
    abi: QuessterBadgesAbi.abi,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address }
  });

  const hasSufficientAllowance = allowance ? allowance >= ENTRY_FEE : false;

  // --- ACTIONS ---

  const approve = async () => {
    try {
      const txHash = await approveAsync({
        address: CUSD_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [QUESSTER_GAME_ADDRESS, ENTRY_FEE], 
        feeCurrency: CUSD_ADDRESS // Paying gas in cUSD is fine for approve
      } as any);
      return txHash;
    } catch (e) {
      console.error("Error approving cUSD:", e);
      return null;
    }
  };
  
  const joinQuest = async (answers: string[]) => {
    setIsJoinPending(true);
    setJoinError(null);
    
    if (!address) {
      setJoinError(new Error("Wallet not connected"));
      setIsJoinPending(false);
      return null;
    }

    try {
      const walletClient = createWalletClient({
        chain: celo, 
        transport: custom(window.ethereum!) 
      });

      const hashedAnswers = answers.map(answer => keccak256(toBytes(answer)));
      const txData = encodeFunctionData({
        abi: CeloQuestAbi.abi,
        functionName: 'joinQuest',
        args: [hashedAnswers],
      });

      // Bare metal send to bypass MiniPay simulation bugs
      const txHash = await walletClient.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: QUESSTER_GAME_ADDRESS,
          data: txData,
          gas: "0x7A120", // 500,000 gas hardcoded
          value: "0x0"
        }]
      } as any);
      
      setIsJoinPending(false);
      await refetchHasJoined();
      return txHash as Address;

    } catch (e: any) {
      console.error("Error joining quest:", e);
      setJoinError(e);
      setIsJoinPending(false);
      return null;
    }
  };

  const createQuest = async (entryFee: string, duration: number, answers: string[]) => {
    setIsJoinPending(true);
    setJoinError(null);

    try {
        const walletClient = createWalletClient({
            chain: celo, 
            transport: custom(window.ethereum!) 
        });

        const hashedAnswers = answers.map(a => keccak256(toBytes(a)));
        const feeWei = parseUnits(entryFee, 18);

        const txData = encodeFunctionData({
            abi: CeloQuestAbi.abi,
            functionName: 'createCommunityQuest',
            args: [feeWei, duration, hashedAnswers]
        });

        const txHash = await walletClient.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: QUESSTER_GAME_ADDRESS,
              data: txData,
              gas: "0x7A120", 
              value: "0x0"
            }]
        } as any);

        return txHash as Address;
    } catch (e: any) {
        console.error("Error creating quest:", e);
        setJoinError(e);
        return null;
    } finally {
        setIsJoinPending(false);
    }
  };

  const mintBadge = async () => {
    setIsMintingBadge(true);
    try {
        const walletClient = createWalletClient({
            chain: celo,
            transport: custom(window.ethereum!) 
        });

        const txData = encodeFunctionData({
            abi: QuessterBadgesAbi.abi,
            functionName: 'mintBadge',
            args: [],
        });

        const txHash = await walletClient.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: QUESSTER_BADGES_ADDRESS,
              data: txData,
            }]
        } as any);

        setIsMintingBadge(false);
        return txHash as Address;
    } catch (e: any) {
        console.error("Error minting badge:", e);
        setIsMintingBadge(false);
        return null;
    }
  };

  // --- ADMIN ACTIONS (Added for Dashboard) ---
  
  const distributeRewards = async (questId: bigint) => {
    setIsJoinPending(true); 
    try {
        const walletClient = createWalletClient({
            chain: celo, 
            transport: custom(window.ethereum!) 
        });

        const txData = encodeFunctionData({
            abi: CeloQuestAbi.abi,
            functionName: 'distributeRewards',
            args: [questId]
        });

        const txHash = await walletClient.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: QUESSTER_GAME_ADDRESS,
              data: txData,
              gas: "0xC3500", // Higher gas (800k) for loop distribution
            }]
        } as any);

        return txHash as Address;
    } catch (e) {
        console.error("Distribute Error:", e);
        throw e;
    } finally {
        setIsJoinPending(false);
    }
  };

  const withdrawPot = async () => {
    setIsJoinPending(true);
    try {
        const walletClient = createWalletClient({
            chain: celo, 
            transport: custom(window.ethereum!) 
        });

        const txData = encodeFunctionData({
            abi: CeloQuestAbi.abi,
            functionName: 'withdraw',
            args: []
        });

        const txHash = await walletClient.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: QUESSTER_GAME_ADDRESS,
              data: txData,
            }]
        } as any);

        return txHash as Address;
    } catch (e) {
        console.error("Withdraw Error:", e);
        throw e;
    } finally {
        setIsJoinPending(false);
    }
  };

  return {
    joinQuest,
    approve,
    createQuest,
    mintBadge,
    // Admin Exports
    distributeRewards,
    withdrawPot,
    
    isPending: isApprovePending || isJoinPending || isMintingBadge,
    error: approveError || joinError,
    userAddress: address,
    hasSufficientAllowance,
    allowance,
    refetchAllowance,
    hasJoined,
    refetchHasJoined,
    badgeBalance: badgeBalance ? Number(badgeBalance) : 0,
    refetchBadge,
    ENTRY_FEE,
    CUSD_ADDRESS,
    // Alias for compatibility
    CUSD_SEPOLIA_ADDRESS: CUSD_ADDRESS, 
    QUESSTER_GAME_ADDRESS
  };
};