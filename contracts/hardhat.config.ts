import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// In Hardhat v2 (CommonJS), __dirname is available globally
dotenv.config({ path: path.resolve(__dirname, "./.env") });

let privateKey = process.env.PRIVATE_KEY;

if (!privateKey) {
  throw new Error("Please set your PRIVATE_KEY in a .env file");
}

// Clean up private key
privateKey = privateKey.trim();
if (!privateKey.startsWith("0x")) {
  privateKey = "0x" + privateKey;
}

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    // Testnet
    celoSepolia: {
      // type: "http", // REMOVED: Not supported in Hardhat v2
      url: "https://forno.celo-sepolia.celo-testnet.org",
      accounts: [privateKey],
      chainId: 11142220,
    },
    // Mainnet
    celo: {
      // type: "http", // REMOVED: Not supported in Hardhat v2
      url: "https://forno.celo.org",
      accounts: [privateKey],
      chainId: 42220,
    },
  },
  paths: {
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain-types",
  },
};

export default config;