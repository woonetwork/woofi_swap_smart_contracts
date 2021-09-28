# Smart contracts of WooFi Swap
Smart contract code for proprietary market making strategy with high capital efficiency and low price spread, configurable rebate mechanism and smart route to 3rd party AMM DEXes if necessary.

## Code structure
With the "minimalism" design from day one, the smart contract for Woo Dex is straightforward and neat. The whole code base consist of 4 main smart contract files (written in Solidity):
| File | Main Function |
| :--- |:---:|
| WooRouter.sol | Routing endpoint to dispatch user trades to Woo private pool or 3rd party dex |
| WooPP.sol | the WooTrade's proprietary market making pool |
| WooPP_proxy.sol | the upgradable proxy file from OpenZepplin |
| RewardManager.sol | the contract for user reward (e.g. trading fee discount or rebate) |

## Dev environment
Remix online IDE.

## Build version
Solidity =0.6.12 with 200 optimization on. "0.6.12" was chosen because it's a stable version used by most flagship DeFi apps (AAVE, Uniswap and Pancake.)

## List of Documentations
Dex design doc: https://shimowendang.com/docs/WGCKdhqQjDjPKcCD
Class diagram: https://www.processon.com/view/link/6107dba2e401fd7c4ed52e93
Dex's proprietary marking making model: https://shimowendang.com/docs/jv98yHh9HHKKRT8h
Certik audit report and tracking record: https://shimowendang.com/docs/wDQqdC6pXgJVhJvG
Dex Contract Integration Doc: https://shimowendang.com/docs/G8PvQdJtHwtwV8Rp

## HardHat tasks

This project demonstrates an advanced Hardhat use case, integrating other tools commonly used alongside Hardhat in the ecosystem.

The project comes with a sample contract, a test for that contract, a sample script that deploys that contract, and an example of a task implementation, which simply lists the available accounts. It also comes with a variety of other tools, preconfigured to work with the project code.

Try running some of the following tasks:

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy.js
node scripts/deploy.js
npx eslint '**/*.js'
npx eslint '**/*.js' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```
