import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import "@openzeppelin/hardhat-upgrades";
import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-solhint'
import 'hardhat-gas-reporter'
import 'solidity-coverage'

import { resolve } from 'path'
import { config as dotenvConfig } from 'dotenv'

dotenvConfig({ path: resolve(__dirname, './.env') })

const chainIds = {
  ganache: 1337,
  goerli: 5,
  hardhat: 43114,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
}

const MNEMONIC = process.env.MNEMONIC || 'The Times 03/Jan/2009 Chancellor on brink of second bailout for banks.'
const DEPLOYER = process.env.DEPLOYER || '8da4ef21b864d2cc526dbdb2a120bd2874c36c9d0a1fb7f8c63d7f7a8b41de8f' // private key here: 怕不怕？

export default {
  defaultNetwork: 'hardhat',
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    hardhat: {
      accounts: {
        mnemonic: MNEMONIC,
      },
      chainId: 43112,
    },
    bsc_testnet: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      chainId: 97,
      gasPrice: 20000000000,
      accounts: [],
    },
    bsc_mainnet: {
      url: 'https://bsc-dataseed.binance.org/',
      chainId: 56,
      gasPrice: 6000000000,
      accounts: [DEPLOYER],
    },
    avax_fuji: {
      url: 'https://api.avax-test.network/ext/bc/C/rpc',
      gasPrice: 225000000000,
      chainId: 43113,
      accounts: [],
    },
    avax_main: {
      url: 'https://api.avax.network/ext/bc/C/rpc',
      gasPrice: 80000000000,
      chainId: 43114,
      accounts: [DEPLOYER],
    },
    fantom_mainnet: {
      url: 'https://rpc.ftm.tools/',
      gasPrice: 200000000000, // gas = 200
      chainId: 250,
      accounts: [DEPLOYER],
    },
    aurora_mainnet: {
      url: 'https://mainnet.aurora.dev',
      gasPrice: 30000000, // gas = 0.03
      chainId: 1313161554,
      accounts: [DEPLOYER],
    },
  },
  solidity: {
    version: '0.6.12',
    settings: {
      evmVersion: 'istanbul',
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: './contracts',
    excludeContracts: ['./contracts/deprecated/*.sol'],
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
  etherscan: {
    apiKey: process.env.Avax_API,
  },
  mocha: {
    timeout: 10000,
  },
  gasReporter: {
    currency: 'AVAX',
    enabled: true,
    gasPrice: 35,
  },
}
