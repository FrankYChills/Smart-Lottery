const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");

const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");

//this is a unit test/ to be done on localhost/harhat
!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle", function () {
      let raffleContract, vrfMock;
      let raffleEntranceFee;
      const chainId = network.config.chainId;
      let deployer;
      let interval;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        // run/deploy all scripts/contracts with tag as 'all'

        await deployments.fixture(["all"]);
        raffleContract = await ethers.getContract("RaffleContract", deployer);
        vrfMock = await ethers.getContract("VRFContract", deployer);
        // console.log(raffleContract);
        // console.log("-------------------------");
        // console.log(vrfMock);
        raffleEntranceFee = await raffleContract.getEntranceFee();
        interval = await raffleContract.getInterval();
        // add a consumer to fix the consumer error
        const subscriptionId = raffleContract.getSubscriptionId();
        // add a consumer to raffleContract resource pool so it can use vrfContract
        await vrfMock.addConsumer(subscriptionId, raffleContract.address);
      });
      describe("constructor", function () {
        it("initializes the raffle contract correctly", async function () {
          const raffleState = await raffleContract.getRaffleState();

          assert.equal(raffleState.toString(), "0");
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });
      describe("enterRaffle", function () {
        it("reverts if paid less amount", async function () {
          await expect(raffleContract.enterRaffle()).to.be.revertedWith(
            "Raffle__NotEnoughETH"
          );
        });
        it("records player when they enter", async function () {
          await raffleContract.enterRaffle({ value: raffleEntranceFee });
          const player = await raffleContract.getPlayer(0);
          assert.equal(player, deployer);
        });
        it("emits an event when any player enters Raffle", async function () {
          await expect(
            raffleContract.enterRaffle({ value: raffleEntranceFee })
          ).to.emit(raffleContract, "RaffleEnter");
        });
        it("doesn't allow entrance when raffle is in Calculating Mode", async function () {
          await raffleContract.enterRaffle({ value: raffleEntranceFee });
          // add the interval+1 secs time to the contract as time passed after we enter the raffle so that checkUpkeep function return true and performUpkeep function can work
          // we are doing this to make the raffle switch to calculating mode
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          // we behave as chainlink node that calls performUpkeep
          await raffleContract.performUpkeep([]);
          // here raffle switches to calculating mode and we should not be able to enter the raffle this time
          await expect(
            raffleContract.enterRaffle({ value: raffleEntranceFee })
          ).to.be.revertedWith("Raffle__NotOpen");
        });
      });
      describe("checkUpkeep", function () {
        it("returns false if people haven't sent any ETH", async function () {
          // console.log(network.provider);
          // again as checkUpkeep will return true only when the time interval has passed by given amount so we have to time travel by interval secs
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          // call checkUpkeep
          //use callstatic as checkUpkeep is a public only/or transaction(memory operations)function but we dont want to do any transaction but to just return something -> this will return as specified in function
          const { upKeepNeeded } = await raffleContract.callStatic.checkUpkeep(
            []
          );
          assert(!upKeepNeeded);
        });
        it("returns false if Raffle isn't OPEN", async function () {
          await raffleContract.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await raffleContract.performUpkeep([]);
          // now here the raffle is in calculating state
          const raffleState = raffleContract.getRaffleState();
          const { upKeepNeeded } = await raffleContract.checkUpkeep([]);
          assert(!upKeepNeeded);
          assert(raffleState.toString(), "1");
        });
        it("returns false if enough time hasn't passed", async () => {
          await raffleContract.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 5,
          ]); // use a higher number here if this test fails
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upKeepNeeded } = await raffleContract.callStatic.checkUpkeep(
            "0x"
          ); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(!upKeepNeeded);
        });
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await raffleContract.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffleContract.callStatic.checkUpkeep(
            "0x"
          ); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(upkeepNeeded);
        });
      });
      describe("performUpkeep", function () {
        it("should run only when checkUpkeep return true", async function () {
          await raffleContract.enterRaffle({ value: raffleEntranceFee });
          await raffleContract.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          // performUpKeep will run successfully  only if checkupKeep is true
          const tx = await raffleContract.performUpkeep([]);
          assert(tx);
        });
        it("reverts when checkUpkeep is false", async function () {
          await expect(raffleContract.performUpkeep([])).to.be.revertedWith(
            "Raffle__UpkeepNotNeeded"
          );
        });
        it("updates the raffle state, emits the event and calls the VRFAggregator", async function () {
          await raffleContract.enterRaffle({ value: raffleEntranceFee });
          await raffleContract.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const txResponse = await raffleContract.performUpkeep([]);
          const txReceipt = await txResponse.wait(1);
          // in txReceipt we get the events returned by the functions
          const requestId = txReceipt.events[1].args.requestId;
          const raffleState = await raffleContract.getRaffleState();
          assert(requestId.toNumber() > 0);
          assert(raffleState.toString(), "1");
        });
      });
      describe("fulfill random words", function () {
        beforeEach(async function () {
          await raffleContract.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
        });
        it("can only be called after performUpkeep is called", async function () {
          // over here we would not call performUpkeep so that we dont have any requestId and call fullfill random words directly with some non existing requestIds(as fulllfill random words takes requestId as argument)
          // we'll call fulfill random words via V2mock contract coz errors are defined there
          await expect(
            vrfMock.fulfillRandomWords(1, raffleContract.address)
          ).to.be.revertedWith("nonexistent request");
          await expect(
            vrfMock.fulfillRandomWords(2, raffleContract.address)
          ).to.be.revertedWith("nonexistent request");
        });
        //----------------Big Test-------------------
        it("picks a winner , resets the lottery and sends money to the winner", async function () {
          const additionalPlayers = 3;
          const startingAccountIndex = 1; //as 0 is deployers index
          // get bunch of more test accounts
          const accounts = await ethers.getSigners();
          console.log(`Account 0 : ${accounts[0].address}`);

          // There are 4 players as the deployer is the first player which enetred the raffle in beforeEach function and also we have increased the time so that checkUpKeep returns true and we can run performUpKeep directly
          for (let i = 1; i <= additionalPlayers; i++) {
            console.log(`Account ${i}: ${accounts[i].address}`);
            // we can connect to raffle contract via other accounts by :
            const accountConnectedRaffle = raffleContract.connect(accounts[i]);
            await accountConnectedRaffle.enterRaffle({
              value: raffleEntranceFee,
            });
          }
          const startingTimeStamp = await raffleContract.getLastTimeStamp();

          await new Promise(async (resolve, reject) => {
            // as soon as WinnerPicked event is triggered :
            raffleContract.once("WinnerPicked", async () => {
              console.log("WinnerPicked Event just got triggered !!");
              try {
                const recentWinner = await raffleContract.getRecentWinner();
                // getRecentWinner returns an address
                console.log(`Winner Account : ${recentWinner}`);
                const winnerEndingBalance = await accounts[1].getBalance();
                // console.log(winnerEndingBalance.toString());
                const raffleState = await raffleContract.getRaffleState();
                const endingTimeStamp = await raffleContract.getLastTimeStamp();
                const numPlayers = await raffleContract.getNumberOfPlayers();

                assert(numPlayers.toString(), "0");
                assert(raffleState.toString(), "0");
                assert(endingTimeStamp > startingTimeStamp);
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance
                    .add(
                      raffleEntranceFee
                        .mul(additionalPlayers)
                        .add(raffleEntranceFee)
                    )
                    .toString()
                );
              } catch (e) {
                reject(e);
              }
              resolve();
            });
            const tx = await raffleContract.performUpkeep([]);
            const txReceipt = await tx.wait(1);

            // call fulfillRandomWords via Mock Contract Only
            //  this function will emit WinnerPicked event
            // console.log(txReceipt.events);
            // lets hardcode the winner is account 1 to check if funds got transfered
            // also starting balance is going to be same for all test accounts
            const winnerStartingBalance = await accounts[1].getBalance();
            // console.log(winnerStartingBalance.toString());
            await vrfMock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              raffleContract.address
            );
          });
        });
      });
    });
