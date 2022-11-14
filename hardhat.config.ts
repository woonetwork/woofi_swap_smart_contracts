import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@openzeppelin/hardhat-upgrades'
import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-solhint'
import 'hardhat-gas-reporter'
import 'solidity-coverage'

import { resolve } from 'path'
import { config as dotenvConfig } from 'dotenv'

dotenvConfig({ path: resolve(__dirname, './.env') })

const accounts = process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [];

export default {
  defaultNetwork: 'hardhat',
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    hardhat: {
      allowUnlimitedContractSize: false,
      hardfork: "berlin", // Berlin is used (temporarily) to avoid issues with coverage
      mining: {
        auto: true,
        interval: 50000,
      },
      gasPrice: "auto",
    },
    bsc_mainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: accounts,
    },
    bsc_testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: accounts,
    },
    avalanche_mainnet: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts: accounts,
    },
    avalanche_testnet: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: accounts,
    },
    fantom_mainnet: {
      url: "https://rpc.ftm.tools/",
      chainId: 250,
      accounts: accounts,
    },
    fantom_testnet: {
      url: "https://rpc.testnet.fantom.network/",
      chainId: 4002,
      accounts: accounts,
    },
    polygon_mainnet: {
      url: "https://polygon-rpc.com/",
      chainId: 137,
      accounts: accounts,
    },
    polygon_testnet: {
      url: "https://matic-mumbai.chainstacklabs.com/",
      chainId: 80001,
      accounts: accounts,
    },
    arbitrum_mainnet: {
      url: "https://arb1.arbitrum.io/rpc/",
      chainId: 42161,
      accounts: accounts,
    },
    arbitrum_testnet: {
      url: "https://rinkeby.arbitrum.io/rpc/",
      chainId: 421611,
      accounts: accounts,
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
    apiKey: {
      mainnet: process.env.ETHERSCAN_KEY,
      // binance smart chain
      bsc: process.env.BSCSCAN_KEY,
      bscTestnet: process.env.BSCSCAN_KEY,
      // avalanche
      avalanche: process.env.SNOWTRACE_KEY,
      avalancheFujiTestnet: process.env.SNOWTRACE_KEY,
      // fantom mainnet
      opera: process.env.FTMSCAN_KEY,
      ftmTestnet: process.env.FTMSCAN_KEY,
      // polygon
      polygon: process.env.POLYGONSCAN_KEY,
      polygonMumbai: process.env.POLYGONSCAN_KEY,
      // arbitrum
      arbitrumOne: process.env.ARBISCAN_KEY,
      arbitrumTestnet: process.env.ARBISCAN_KEY,
    },
  },
  mocha: {
    timeout: 20000,
  },
  gasReporter: {
    currency: 'ETH',
    enabled: true,
  },
}
