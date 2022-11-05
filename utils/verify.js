const { run } = require("hardhat");
async function verify(contractAddress, args) {
  console.log("Verifying contract ...");
  // run allows us to run any hardhat tasks(those which can be seen in shell logs)
  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: args,
    });
  } catch (e) {
    if (e.message.toLowerCase().includes("already verified")) {
      console.log("Contract is already Verified !!");
    } else {
      console.log(e);
    }
  }
}
module.exports = { verify };
