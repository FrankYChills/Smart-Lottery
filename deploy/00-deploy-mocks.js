// this file deploys the mock contract that is VRFCoordinatorV2

const { network } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25"); //0.25 LINKS/Request

const GAS_PRICE_LINK = 1e9; // gas/link

// this contract is deployed only when we are on localhost or hardhat not on testnet or mainnet
module.exports = async (hre) => {
  const { getNamedAccounts, deployments } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;
  //   const chainId = network.config.chainId;

  if (developmentChains.includes(network.name)) {
    log("Local Network detected.Deploying Mock | VRFCoordinatorV2 ...");
    // deploy the MOck VRF Contract
    // requesting/calling VRF on localhost/hardhat it uses basefee
    await deploy("VRFContract", {
      contract: "VRFCoordinatorV2Mock",
      from: deployer,
      log: true,
      args: [BASE_FEE, GAS_PRICE_LINK],
    });
    log("Mocks Deployed :) ");
    log("----------------------------------------------");
  } else {
    log("Testnet detected ..");
  }
};
module.exports.tags = ["all", "mocks"];
