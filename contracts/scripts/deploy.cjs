// scripts/deploy.cjs
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  console.log("Deploying CeloQuest contract...");

  // 1. Read ABI + bytecode
  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/CeloQuest.sol/CeloQuest.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // 2. Get network config
  const networkConfig = hre.config.networks.celoSepolia;
  if (!networkConfig) {
    throw new Error("Celo Sepolia network not configured in hardhat.config.ts");
  }

  const networkUrl = networkConfig.url;
  const privateKey = networkConfig.accounts[0];

  // 3. Connect wallet
  const provider = new ethers.JsonRpcProvider(networkUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  // 4. Deploy
  const CeloQuestFactory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  console.log("Deploying... (this may take a minute)");
  const celoQuest = await CeloQuestFactory.deploy();

  await celoQuest.waitForDeployment();

  console.log(`CeloQuest deployed to: ${await celoQuest.getAddress()}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
