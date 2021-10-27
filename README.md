<br>
<p align="center"><img src="http://woofi.iamkun.com/_nuxt/img/8993400.png" width="320" /></p>
<div align="center">
  <a href="https://github.com/woonetwork/woofi_swap_smart_contracts/actions/workflows/build.yml" style="text-decoration:none;">
    <img src="https://github.com/woonetwork/woofi_swap_smart_contracts/actions/workflows/build.yml/badge.svg" alt='Build' />
  </a>
  <a href='https://github.com/woonetwork/woofi_swap_smart_contracts/actions/workflows/lint.yml' style="text-decoration:none;">
    <img src='https://github.com/woonetwork/woofi_swap_smart_contracts/actions/workflows/lint.yml/badge.svg' alt='Lint' />
  </a>
  <a href='https://github.com/woonetwork/woofi_swap_smart_contracts/actions/workflows/unit_tests.yml' style="text-decoration:none;">
    <img src='https://github.com/woonetwork/woofi_swap_smart_contracts/actions/workflows/unit_tests.yml/badge.svg' alt='Unit Tests' />
  </a>
</div>
<br>

## WOOFi Swap V1.0

This repository contains the smart contracts and solidity library for the WOOFi Swap v1. WOOFi Swap is a decentralized exchange using a brand new on-chain market making algorithm called Synthetic Proactive Market Making (sPMM), which is designed for professional market makers to generate an on-chain orderbook simulating the price, spread and depth from centralized liquidity sources. Read more here.

## Security

#### Bug Bounty

Bug bounty for the smart contracts: [Bug Bounty](https://learn.woo.org/woofi/woofi-swap/bug-bounty).

#### Security Audit

3rd party security audit: [Audit Report](https://learn.woo.org/woofi/woofi-swap/audits).

## Code structure

With the "minimalism" design, the whole code base consist of 4 main smart contract (in solidity):
| File | Main Function |
| :--- |:---:|
| WooRouter.sol | Router contract to dispatch user trades to Woo Private Pool or 3rd party dex |
| WooPP.sol | The WooTrade's proprietary market making pool and swap the given tokens |
| Wooracle.sol | Proprietary oracle to push the latest market price, spread and slippage info |
| WooGuardian.sol | The trading price and amount verification and defense contract |

## BSC Mainnet deployment

| Contract    |                                                     BSC address                                                      |
| :---------- | :------------------------------------------------------------------------------------------------------------------: |
| WooRouter   | [0x114f84658c99aa6EA62e3160a87A16dEaF7EFe83](https://bscscan.com/address/0x114f84658c99aa6ea62e3160a87a16deaf7efe83) |
| WooPP       | [0x8489d142Da126F4Ea01750e80ccAa12FD1642988](https://bscscan.com/address/0x8489d142Da126F4Ea01750e80ccAa12FD1642988) |
| WooGuardian | [0xC90ec9Fe0d243B98DdF5468AFaFB4863EF12002F](https://bscscan.com/address/0xC90ec9Fe0d243B98DdF5468AFaFB4863EF12002F) |
| Wooracle    | [0xea4edfEfF60B375556459e106AB57B696c202A29](https://bscscan.com/address/0xea4edfEfF60B375556459e106AB57B696c202A29) |

## Local Build & Tests

Hardhat and yarn are utilized to compile, build and run tests for WOOFi smart contracts. We recommend to install [Hardhat](https://hardhat.org/) and [Shorthand (hh) and autocomplete](https://hardhat.org/guides/shorthand.html).

To build the smart contracts:

```
yarn
hh compile
```

To run the unit tests:

```
yarn build-test
hh test
```

## Using solidity interfaces

To directly interact with WooPP interface:

#### IWooRouter Interface

```solidity
/// @dev query the amount to swap fromToken -> toToken
/// @param fromToken the from token
/// @param toToken the to token
/// @param fromAmount the amount of fromToken to swap
/// @return toAmount the predicted amount to receive
function querySwap(
  address fromToken,
  address toToken,
  uint256 fromAmount
) external view returns (uint256 toAmount);

/// @dev swap fromToken -> toToken
/// @param fromToken the from token
/// @param toToken the to token
/// @param fromAmount the amount of fromToken to swap
/// @param minToAmount the amount of fromToken to swap
/// @param to the amount of fromToken to swap
/// @param rebateTo the amount of fromToken to swap
/// @return realToAmount the amount of toToken to receive
function swap(
  address fromToken,
  address toToken,
  uint256 fromAmount,
  uint256 minToAmount,
  address payable to,
  address rebateTo
) external payable returns (uint256 realToAmount);

```

#### IWooPP Interface

```solidity
/// @dev Swap baseToken into quoteToken
/// @param baseToken the base token
/// @param baseAmount amount of baseToken that user want to swap
/// @param minQuoteAmount minimum amount of quoteToken that user accept to receive
/// @param to quoteToken receiver address
/// @param rebateTo the wallet address for rebate
/// @return quoteAmount the swapped amount of quote token
function sellBase(
  address baseToken,
  uint256 baseAmount,
  uint256 minQuoteAmount,
  address to,
  address rebateTo
) external returns (uint256 quoteAmount);

/// @dev Swap quoteToken into baseToken
/// @param baseToken the base token
/// @param quoteAmount amount of quoteToken that user want to swap
/// @param minBaseAmount minimum amount of baseToken that user accept to receive
/// @param to baseToken receiver address
/// @param rebateTo the wallet address for rebate
/// @return baseAmount the swapped amount of base token
function sellQuote(
  address baseToken,
  uint256 quoteAmount,
  uint256 minBaseAmount,
  address to,
  address rebateTo
) external returns (uint256 baseAmount);

/// @dev Query the amount for selling the base token amount.
/// @param baseToken the base token to sell
/// @param baseAmount the amount to sell
/// @return quoteAmount the swapped quote amount
function querySellBase(address baseToken, uint256 baseAmount) external view returns (uint256 quoteAmount);

/// @dev Query the amount for selling the quote token.
/// @param baseToken the base token to receive (buy)
/// @param quoteAmount the amount to sell
/// @return baseAmount the swapped base token amount
function querySellQuote(address baseToken, uint256 quoteAmount) external view returns (uint256 baseAmount);

```

## Licensing

```
MIT License
===========

Copyright (c) 2021 WooTrade

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
