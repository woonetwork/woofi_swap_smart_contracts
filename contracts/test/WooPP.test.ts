const { expect } = require('chai')
const { ethers } = require('hardhat')

const { BN, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const WooPP = artifacts.require('WooPP');

const [owner, addr1] = await ethers.getSigners();

describe('WooPP Test Suite', function () {
  before(async function () {
    this.WooPP = await ethers.getContractFactory('WooPP');
  });

  beforeEach(async function () {
    this.wooPP = await this.WooPP.deploy('', '', '', '');
    await this.wooPP.deployed();
  });

  // Test case
  it('', async function () {
    // Store a value
    // await this.box.store(42);

    // Test if the returned value is the same one
    // Note that we need to use strings to compare the 256 bit integers
    // expect((await this.box.retrieve()).toString()).to.equal('42');
  });
});
