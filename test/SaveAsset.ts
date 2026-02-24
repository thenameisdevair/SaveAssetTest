const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers"); // HH2-friendly fixtures :contentReference[oaicite:3]{index=3}

describe("SaveAsset", function () {
  async function deployFixture() {
    const [deployer, alice, bob] = await ethers.getSigners();

    // Deploy MockERC20 with initial supply to Alice
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const initialSupply = ethers.parseEther("100000"); // 100k
    const mock = await MockERC20.deploy(alice.address, initialSupply);

    // Deploy SaveAsset with token address
    const SaveAsset = await ethers.getContractFactory("SaveAsset");
    const save = await SaveAsset.deploy(await mock.getAddress());

    return { deployer, alice, bob, mock, save, initialSupply };
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
      .withArgs(alice.address, withdrawAmt, "0x"); // empty return data on plain call

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

    // withdraw more than balance -> balances[msg.sender] = userSavings_ - _amount underflows and reverts
    await expect(save.connect(alice).withdraw(depositAmt + 1n))
      .to.be.reverted; // generic revert is fine (panic code can vary)
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

  it("8) receive()/fallback: contract can accept plain ETH transfers", async function () {
    const { alice, save } = await loadFixture(deployFixture);

    // send ETH directly to contract (hits receive())
    await alice.sendTransaction({ to: await save.getAddress(), value: ethers.parseEther("1") });

    // balances mapping shouldn't change because deposit() wasn't called
    expect(await save.connect(alice).getUserSavings()).to.equal(0n);
    expect(await save.getContractBalance()).to.equal(ethers.parseEther("1"));
  });

  it("9) depositERC20(): transfers tokens in, updates ERC20 savings, emits DepositSuccessful", async function () {
    const { alice, save, mock } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("1000");

    // approve SaveAsset to pull tokens
    await mock.connect(alice).approve(await save.getAddress(), amount);

    await expect(save.connect(alice).depositERC20(amount))
      .to.emit(save, "DepositSuccessful")
      .withArgs(alice.address, amount);

    expect(await save.connect(alice).getErc20SavingsBalance()).to.equal(amount);

    // contract actually received tokens
    expect(await mock.balanceOf(await save.getAddress())).to.equal(amount);
  });

  it("10) withdrawERC20(): sends tokens out + updates savings; reverts on zero or not enough", async function () {
    const { alice, save, mock } = await loadFixture(deployFixture);

    const depositAmt = ethers.parseEther("500");
    const withdrawAmt = ethers.parseEther("200");

    await mock.connect(alice).approve(await save.getAddress(), depositAmt);
    await save.connect(alice).depositERC20(depositAmt);

    // success path + event (bytes data is "")
    await expect(save.connect(alice).withdrawERC20(withdrawAmt))
      .to.emit(save, "WithdrawalSuccessful")
      .withArgs(alice.address, withdrawAmt, "0x");

    expect(await save.connect(alice).getErc20SavingsBalance()).to.equal(depositAmt - withdrawAmt);

    // revert: zero amount
    await expect(save.connect(alice).withdrawERC20(0n))
      .to.be.revertedWith("Can't send zero value");

    // revert: not enough savings
    await expect(save.connect(alice).withdrawERC20(ethers.parseEther("1000000")))
      .to.be.revertedWith("Not enough savings");
  });
});