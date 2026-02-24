const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("SaveAsset (using user's ERC20)", function () {
  async function deployFixture() {
    const [deployer, alice, bob] = await ethers.getSigners();

    // Deploy YOUR ERC20
    const ERC20 = await ethers.getContractFactory("ERC20");
    const totalSupply = ethers.parseEther("1000000"); // 1,000,000 tokens (18 decimals)
    const token = await ERC20.deploy("DevairToken", "DVT", totalSupply);

    // Deploy SaveAsset with token address
    const SaveAsset = await ethers.getContractFactory("SaveAsset");
    const save = await SaveAsset.deploy(await token.getAddress());

    return { deployer, alice, bob, token, save, totalSupply };
  }

  it("1) deposit(): increases user ETH savings + emits DepositSuccessful", async function () {
    const { alice, save } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("1");
    await expect(save.connect(alice).deposit({ value: amount }))
      .to.emit(save, "DepositSuccessful")
      .withArgs(alice.address, amount);

    expect(await save.connect(alice).getUserSavings()).to.equal(amount);
  });

  it("2) deposit(): reverts on zero value", async function () {
    const { alice, save } = await loadFixture(deployFixture);

    await expect(save.connect(alice).deposit({ value: 0n }))
      .to.be.revertedWith("Can't deposit zero value");
  });

  it("3) withdraw(): sends ETH, updates savings, emits WithdrawalSuccessful", async function () {
    const { alice, save } = await loadFixture(deployFixture);

    const depositAmt = ethers.parseEther("2");
    const withdrawAmt = ethers.parseEther("0.5");

    await save.connect(alice).deposit({ value: depositAmt });

    await expect(save.connect(alice).withdraw(withdrawAmt))
      .to.emit(save, "WithdrawalSuccessful")
      .withArgs(alice.address, withdrawAmt, "0x");

    expect(await save.connect(alice).getUserSavings()).to.equal(depositAmt - withdrawAmt);
  });

  it("4) withdraw(): reverts if user has no savings", async function () {
    const { alice, save } = await loadFixture(deployFixture);

    await expect(save.connect(alice).withdraw(1n))
      .to.be.revertedWith("Insufficient funds");
  });

  it("5) withdraw(): reverts if amount > savings (Solidity 0.8 underflow)", async function () {
    const { alice, save } = await loadFixture(deployFixture);

    const depositAmt = ethers.parseEther("1");
    await save.connect(alice).deposit({ value: depositAmt });

    await expect(save.connect(alice).withdraw(depositAmt + 1n))
      .to.be.reverted; // underflow revert (no custom message in your contract)
  });

  it("6) getUserSavings(): returns caller's ETH savings", async function () {
    const { alice, bob, save } = await loadFixture(deployFixture);

    await save.connect(alice).deposit({ value: ethers.parseEther("1") });
    await save.connect(bob).deposit({ value: ethers.parseEther("3") });

    expect(await save.connect(alice).getUserSavings()).to.equal(ethers.parseEther("1"));
    expect(await save.connect(bob).getUserSavings()).to.equal(ethers.parseEther("3"));
  });

  it("7) getContractBalance(): returns ETH held by contract", async function () {
    const { alice, bob, save } = await loadFixture(deployFixture);

    await save.connect(alice).deposit({ value: ethers.parseEther("1") });
    await save.connect(bob).deposit({ value: ethers.parseEther("2") });

    expect(await save.getContractBalance()).to.equal(ethers.parseEther("3"));
  });

  it("8) receive()/fallback: contract accepts plain ETH transfers", async function () {
    const { alice, save } = await loadFixture(deployFixture);

    await alice.sendTransaction({
      to: await save.getAddress(),
      value: ethers.parseEther("1"),
      data: "0x", // receive()
    });

    // balances mapping shouldn't change (deposit() wasn't called)
    expect(await save.connect(alice).getUserSavings()).to.equal(0n);
    expect(await save.getContractBalance()).to.equal(ethers.parseEther("1"));
  });

  it("9) depositERC20(): transfersFrom user, updates ERC20 savings, emits DepositSuccessful", async function () {
    const { deployer, alice, token, save } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("1000");

    // Deployer currently owns all supply; send some to Alice
    await expect(token.connect(deployer).transfer(alice.address, amount))
      .to.emit(token, "Transfer")
      .withArgs(deployer.address, alice.address, amount);

    // Alice approves SaveAsset (your approve requires >0 and balance >= value)
    await expect(token.connect(alice).approve(await save.getAddress(), amount))
      .to.emit(token, "Approval")
      .withArgs(alice.address, await save.getAddress(), amount);

    // Deposit ERC20 into SaveAsset
    await expect(save.connect(alice).depositERC20(amount))
      .to.emit(save, "DepositSuccessful")
      .withArgs(alice.address, amount);

    expect(await save.connect(alice).getErc20SavingsBalance()).to.equal(amount);

    // Contract received the tokens (balanceOf on your ERC20)
    expect(await token.balanceOf(await save.getAddress())).to.equal(amount);
  });

  it("10) withdrawERC20(): sends tokens out + updates savings; reverts on zero or not enough savings", async function () {
    const { deployer, alice, token, save } = await loadFixture(deployFixture);

    const depositAmt = ethers.parseEther("500");
    const withdrawAmt = ethers.parseEther("200");

    // Fund Alice
    await token.connect(deployer).transfer(alice.address, depositAmt);

    // Approve SaveAsset
    await token.connect(alice).approve(await save.getAddress(), depositAmt);

    // Deposit
    await save.connect(alice).depositERC20(depositAmt);

    // Successful withdraw
    await expect(save.connect(alice).withdrawERC20(withdrawAmt))
      .to.emit(save, "WithdrawalSuccessful")
      .withArgs(alice.address, withdrawAmt, "0x");

    expect(await save.connect(alice).getErc20SavingsBalance()).to.equal(depositAmt - withdrawAmt);

    // Revert: zero amount
    await expect(save.connect(alice).withdrawERC20(0n))
      .to.be.revertedWith("Can't send zero value");

    // Revert: not enough savings
    await expect(save.connect(alice).withdrawERC20(ethers.parseEther("9999999")))
      .to.be.revertedWith("Not enough savings");
  });
});