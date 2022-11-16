// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

//imports
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";
import "hardhat/console.sol";
// import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";

//Custom Errors
error Raffle__NotEnoughETH();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(
    uint256 currentBalance,
    uint256 numPlayers,
    uint256 raffleState
);

/**@title A sample Raffle Contract
 * @author KC
 * @notice This contract is for creating a sample raffle contract
 * @dev This implements the Chainlink VRF Version 2
 */

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /*  Custom Type Declarartions */
    enum RaffleState {
        OPEN,
        CALCULATING
        //returns 0 if open and 1 if calculating and so on...eg 2 if...
    }
    //State Variables
    // there are two kind of parameters - Indexed and non-indexed and we can only have upto 3 indexed params(they are easier to search)
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 1;
    string public Country = "IndiaUK02";

    //Lottery Variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    // Events
    event RaffleEnter(address indexed player);
    event RequestRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed player);

    //Interface(address) = Contract
    // Interface is also a kind of contract
    constructor(
        address vrfCoordinatorV2,
        uint256 fee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = fee;
        // get the contract
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETH();
        }
        // no one should be allowed to enter raffle if raffle state isnt open
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }
        // by default msg.sender isnt payable type to send money back to(win condition) so we have to type cast that
        s_players.push(payable(msg.sender));
        // Emit an Event when we update a dynamic array or mapping
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev checkUpKeep and performUpKeep needs to be in the contract so that chainlink nodes can automate these
     * this is the function that chainlink nodes check for checking if this returns true
     * the following function will return true on based conditions:
     * 1. Time Interval should have passed 2.The lottery should have some ETH Amount.
     * 3.Our subscription should have been funded with LINKS 4.lottery should be in 'open' state
     * once checkUpKeep returns true it automaticlly calls performUpKeep
     */
    function checkUpkeep(
        bytes memory /*checkData*/
    )
        public
        override
        returns (
            bool upkeepNeeded,
            bytes memory /*performData*/
        )
    {
        console.log("Upkeep just got called");
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        // curr timestamp - prevtimestamp(or the time passed ) >= interval at which functions needs to be called
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = (address(this).balance > 0);
        upkeepNeeded = isOpen && timePassed && hasPlayers && hasBalance;
        return (upkeepNeeded, "0x0");
        // if this returns true that means we need to get and pay winner and reset the players
    }

    // Pick a Random Winner
    function performUpkeep(
        bytes calldata /*performData*/
    ) external override {
        // performUpkeep should only be called when the timeinterval has passed so we'll check that
        console.log("perform upKeep got called");
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }

        // request random number and do work with that
        // Use Chainlink VRF
        // when we are requesting for random num so raffleState should be calculating
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //gaslane
            // subs id is the contract id in subscription resource for using funds to call chainlink VRFs
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestRaffleWinner(requestId);
    }

    // as soon as we get the requestId, fulfillRandomWords is called
    // override - adding these lines to the original function
    function fulfillRandomWords(
        uint256, /*requestId */
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        // after getting winner update raffle State,empty the array and reset the last timestamp to current
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0);
        s_lastTimeStamp = block.timestamp;
        // send contract money  to the winner
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    //View/Pure functions

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLastTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getSubscriptionId() public view returns (uint256) {
        return i_subscriptionId;
    }
}
