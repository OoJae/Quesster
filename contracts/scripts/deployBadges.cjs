// scripts/deployBadges.cjs
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const hre = require("hardhat");

async function main() {
  // Get the network name from the CLI command (e.g., 'celo' or 'celoSepolia')
  const networkName = hre.network.name;
  console.log(`Deploying QuessterBadges contract to: ${networkName.toUpperCase()}...`);

  const artifactPath = path.resolve(
    process.cwd(),
    "./artifacts/contracts/QuessterBadges.sol/QuessterBadges.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Dynamically grab the config for the selected network
  const networkConfig = hre.config.networks[networkName];

  if (!networkConfig || !networkConfig.url) {
    throw new Error(`Network configuration for '${networkName}' not found in hardhat.config.ts`);
  }

  const networkUrl = networkConfig.url;
  const privateKey = networkConfig.accounts[0];

  const provider = new ethers.JsonRpcProvider(networkUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const Factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  console.log("Deploying... (This may take a minute)");
  const badgesContract = await Factory.deploy();

  await badgesContract.waitForDeployment();

  const address = await badgesContract.getAddress();
  console.log(`✅ QuessterBadges deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});