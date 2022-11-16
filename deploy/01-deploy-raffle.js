const { verify } = require("../utils/verify");
const { network, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../helper-hardhat-config");

const VRF_SUB_FUND_AMOUNT = "3000000000000000000";

module.exports = async (hre) => {
  const { getNamedAccounts, deployments } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  // get Mock Address (according to network)
  var vrfCoordinatorV2Address;
  var subscriptionId;
  // for localhost/hardhat we'll do subscription programatically but for testnet we'll do via UI
  if (developmentChains.includes(network.name)) {
    // get the deployed mock address
    console.log("Finding deployed Mock Contract ...");
    const vrfCoordinatorV2 = await ethers.getContract("VRFContract");
    vrfCoordinatorV2Address = vrfCoordinatorV2.address;
    // create a subscription for the raffle/main contract
    const txResponse = await vrfCoordinatorV2.createSubscription();
    const txReceipt = await txResponse.wait(1);
    // in the response back we get the associated events wrt that function
    subscriptionId = txReceipt.events[0].args.subId;
    // fund the subscription using subId and amount
    await vrfCoordinatorV2.fundSubscription(
      subscriptionId,
      VRF_SUB_FUND_AMOUNT
    );
  } else {
    // if not on local network means on testnet/mainnet
    vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2Address"];
    subscriptionId = networkConfig[chainId]["subscriptionId"];
  }

  //The Subscription Manager lets you create a subcription and pre-pay for VRF v2 so you don't need to provide funding each time your application requests randomness.
  // contract params
  const entranceFee = networkConfig[chainId]["entranceFee"];
  const gasLane = networkConfig[chainId]["gasLane"];
  const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"];
  const interval = networkConfig[chainId]["interval"];
  const args = [
    vrfCoordinatorV2Address,
    entranceFee,
    gasLane,
    subscriptionId,
    callbackGasLimit,
    interval,
  ];
  const raffle = await deploy("RaffleContract", {
    contract: "Raffle",
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  // the above raffle will get a receipt and code data such as abi and bytecode etc back

  //verify the contract
  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    // if not on localhost/hardhat network
    log("Verifying the contract on etherscan ...");
    await verify(raffle.address, args);
    log(">>> Verified on Etherscan <<<");
    log("-----------------------------------------------------");
  }
};
module.exports.tags = ["all", "raffle"];
