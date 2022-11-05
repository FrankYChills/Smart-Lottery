const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");

const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");

// this is staging test / to be done on testnet
developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle", function () {
      let raffleContract;
      let raffleEntranceFee;

      let deployer;
      let interval;
      console.log("Starting Staging Test ");
      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        // run/deploy all scripts/contracts with tag as 'all'

        // await deployments.fixture(["all"]);  // we'll deploy contract via deploy script(before running this script)
        raffleContract = await ethers.getContract("RaffleContract", deployer);
        // we dont need mock cause in testnet chainlink keepers/automators will call mock's functions itself
        // vrfMock = await ethers.getContract("VRFContract", deployer);
        // console.log(raffleContract);
        // console.log("-------------------------");
        // console.log(vrfMock);
        raffleEntranceFee = await raffleContract.getEntranceFee();
        interval = await raffleContract.getInterval();
      });
      describe("fulfill random words", function () {
        it("works with live chainlink keepers and chainlink VRF so we get a random winner", async function () {
          const startingTimeStamp = await raffleContract.getLastTimeStamp();
          const accounts = await ethers.getSigners();
          // set up the listener before we enter the raffle
          await new Promise(async (resolve, reject) => {
            // this listener will continiously check if the contract has emitted the respective event
            raffleContract.once("WinnerPicked", async function () {
              console.log("WinnerPick Event just got triggered");
              try {
                const recentWinner = await raffleContract.getRecentWinner();
                const raffleState = await raffleContract.getRaffleState();
                const winnerEndingBalance = await accounts[0].getBalance(); // deployer's
                const endingTimeStamp = await raffleContract.getLastTimeStamp();
                await expect(raffleContract.getPlayer(0)).to.be.reverted;
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(raffleState, 0);
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(raffleEntranceFee).toString()
                );
                assert(endingTimeStamp > startingTimeStamp);
              } catch (e) {
                reject(e);
              }
              resolve();
            });
            // the code stays inside Promise until it gets resolved or rejected
            console.log("Initiating..");
            const tx = await raffleContract.enterRaffle({
              value: raffleEntranceFee,
            });
            console.log("Raffle Entered.Now listening for WinnerPicked event");
            await tx.wait(1);
            console.log("Ok, time to wait...");
            // after entering raffle the chainlink keeper should do all the things we have been doing in unit tests so that WinnerPicked events gets emitted
            const winnerStartingBalance = await accounts[0].getBalance();
          });
        });
      });
    });
