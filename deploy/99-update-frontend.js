// This script updates the frontend wrt to the network contract is deployed on
const { ethers, network } = require("hardhat");
const fs = require("fs");
const FRONTEND_ADDRESSESFILE =
  "../fend-smart-lottery/constants/contractAddresses.json";
const FRONTEND_ABIFILE = "../fend-smart-lottery/constants/abi.json";

module.exports = async () => {
  if (process.env.UPDATE_FRONTEND) {
    console.log("Updating Frontend ...");
    await updateContractAddresses();
    await updateABI();
  }
};

async function updateContractAddresses() {
  // update contract address file with current address
  console.log("Getting deployed RaffleContract ..");
  const raffle = await ethers.getContract("RaffleContract");
  const chainId = network.config.chainId.toString();
  // make new json object to update previous object
  const currentAddress = JSON.parse(
    fs.readFileSync(FRONTEND_ADDRESSESFILE, "utf8")
  );
  if (chainId in currentAddress) {
    if (!currentAddress[chainId].includes(raffle.address)) {
      currentAddress[chainId].push(raffle.address);
    }
  } else {
    currentAddress[chainId] = [raffle.address];
  }
  // update file
  fs.writeFileSync(FRONTEND_ADDRESSESFILE, JSON.stringify(currentAddress));
}

async function updateABI() {
  const raffle = await ethers.getContract("RaffleContract");
  // update abifile with current contract ABI
  fs.writeFileSync(
    FRONTEND_ABIFILE,
    raffle.interface.format(ethers.utils.FormatTypes.json)
  );
}

module.exports.tags = ["all", "frontend"];
