const { ethers } = require("ethers");
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // 1. Setup Configuration
  // Your Wallet Address
  const TO_ADDRESS = "0xc3E3B365fB4a2148c6C2FA97A73B42d57de75f5C"; 
  
  // Your NEW Mainnet Badge Contract Address
  const CONTRACT_ADDRESS = "0x4E89c39C642162147308A12E12E0A982C1014b6D"; 

  console.log(`Minting Quesster Badge to: ${TO_ADDRESS} on Mainnet...`);

  // 2. Get Network Config (Mainnet 'celo')
  const networkConfig = hre.config.networks.celo;
  const provider = new ethers.JsonRpcProvider(networkConfig.url);
  const wallet = new ethers.Wallet(networkConfig.accounts[0], provider);

  // 3. Get ABI
  const artifactPath = path.resolve(
    process.cwd(),
    "./artifacts/contracts/QuessterBadges.sol/QuessterBadges.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // 4. Connect to Contract
  const badgeContract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, wallet);

  // 5. Mint
  const tx = await badgeContract.safeMint(TO_ADDRESS);
  console.log("Transaction sent:", tx.hash);

  await tx.wait();
  console.log("✅ Success! Badge minted on Mainnet.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});