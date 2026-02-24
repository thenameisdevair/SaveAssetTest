const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ERC20 + SaveAsset Integration Tests", function () {

  async function deployFixture() {
    const [deployer, alice, bob] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("ERC20");

    const totalSupply = ethers.parseEther("1000000");

    const token = await ERC20.deploy(
      "DevairToken",
      "DVT",
      totalSupply
    );

    const SaveAsset = await ethers.getContractFactory("SaveAsset");
    const save = await SaveAsset.deploy(await token.getAddress());

    return { deployer, alice, bob, token, save, totalSupply };
  }

  /* ========================================================= */
  /* ===================== ERC20 TESTS ======================= */
  /* ========================================================= */

  it("ERC20: returns correct name", async function () {
    const { token } = await loadFixture(deployFixture);

    expect(await token.name()).to.equal("DevairToken");
  });

  it("ERC20: returns correct symbol", async function () {
    const { token } = await loadFixture(deployFixture);

    expect(await token.symbol()).to.equal("DVT");
  });

  it("ERC20: returns correct decimals", async function () {
    const { token } = await loadFixture(deployFixture);

    expect(await token.decimals()).to.equal(18);
  });

  it("ERC20: returns correct total supply", async function () {
    const { token, totalSupply } = await loadFixture(deployFixture);

    expect(await token.totalSupply()).to.equal(totalSupply);
  });

  /* ========================================================= */
  /* ===================== ETH TESTS ========================= */
  /* ========================================================= */

  it("deposit(): increases user ETH savings", async function () {
    const { alice, save } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("1");

    await save.connect(alice).deposit({ value: amount });

    expect(await save.connect(alice).getUserSavings()).to.equal(amount);
  });

  it("withdraw(): reduces user savings", async function () {
    const { alice, save } = await loadFixture(deployFixture);

    const depositAmt = ethers.parseEther("2");
    const withdrawAmt = ethers.parseEther("1");

    await save.connect(alice).deposit({ value: depositAmt });
    await save.connect(alice).withdraw(withdrawAmt);

    expect(await save.connect(alice).getUserSavings())
      .to.equal(depositAmt - withdrawAmt);
  });

  /* ========================================================= */
  /* ===================== ERC20 TESTS ======================= */
  /* ========================================================= */

  it("depositERC20(): updates savings mapping", async function () {
    const { deployer, alice, token, save } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("1000");

    await token.connect(deployer).transfer(alice.address, amount);

    await token.connect(alice)
      .approve(await save.getAddress(), amount);

    await save.connect(alice).depositERC20(amount);

    expect(await save.connect(alice)
      .getErc20SavingsBalance()).to.equal(amount);
  });

  it("withdrawERC20(): reduces ERC20 savings", async function () {
    const { deployer, alice, token, save } = await loadFixture(deployFixture);

    const depositAmt = ethers.parseEther("500");
    const withdrawAmt = ethers.parseEther("200");

    await token.connect(deployer).transfer(alice.address, depositAmt);
    await token.connect(alice).approve(await save.getAddress(), depositAmt);
    await save.connect(alice).depositERC20(depositAmt);

    await save.connect(alice).withdrawERC20(withdrawAmt);

    expect(await save.connect(alice)
      .getErc20SavingsBalance())
      .to.equal(depositAmt - withdrawAmt);
  });

});