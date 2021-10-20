import '../WooPP.sol';
import '../Wooracle.sol';

contract WooPPVirtual is WooPP {
    constructor(
        address newQuoteToken,
        address newPriceOracle,
        address quoteChainlinkRefOracle
    ) public WooPP(newQuoteToken, newPriceOracle, quoteChainlinkRefOracle) {}

    mapping(address => uint256) public virtualBalance;
    mapping(address => uint256) public initialBalance;

    function setVirtualBalance(address token, uint256 newBalance) public onlyOwner {
        initialBalance[token] = virtualBalance[token] = newBalance;
    }

    function virtualTransferIn(address token, uint256 amount) internal {
        virtualBalance[token] = virtualBalance[token].add(amount);
    }

    function virtualTransferOut(address token, uint256 amount) internal {
        virtualBalance[token] = virtualBalance[token].sub(amount);
    }

    function virtualUpdate(
        address baseToken,
        TokenInfo memory baseInfo,
        TokenInfo memory quoteInfo
    ) private view {
        uint256 baseReserve = virtualBalance[baseToken];
        uint256 quoteReserve = virtualBalance[quoteToken];
        require(baseReserve <= type(uint112).max);
        require(quoteReserve <= type(uint112).max);
        baseInfo.reserve = uint112(baseReserve);
        quoteInfo.reserve = uint112(quoteReserve);
    }

    function virtualSellBase(address baseToken, uint256 baseAmount) public {
        TokenInfo memory baseInfo = tokenInfo[baseToken];
        require(baseInfo.isValid, 'WooPP: TOKEN_DOES_NOT_EXIST');
        TokenInfo memory quoteInfo = tokenInfo[quoteToken];
        virtualUpdate(baseToken, baseInfo, quoteInfo);

        uint256 realQuoteAmount = getQuoteAmountSellBase(baseToken, baseAmount, baseInfo, quoteInfo);
        virtualTransferIn(baseToken, baseAmount);
        virtualTransferOut(quoteToken, realQuoteAmount);
    }

    function virtualSellQuote(address baseToken, uint256 quoteAmount) public {
        TokenInfo memory baseInfo = tokenInfo[baseToken];
        require(baseInfo.isValid, 'WooPP: TOKEN_DOES_NOT_EXIST');
        TokenInfo memory quoteInfo = tokenInfo[quoteToken];
        virtualUpdate(baseToken, baseInfo, quoteInfo);

        uint256 realBaseAmount = getBaseAmountSellQuote(baseToken, quoteAmount, baseInfo, quoteInfo);
        virtualTransferIn(quoteToken, quoteAmount);
        virtualTransferOut(baseToken, realBaseAmount);
    }

    function bad(address token, uint256 amount) public {
        virtualTransferOut(token, amount);
    }
}

contract WooPPEchidnaTest is WooPPVirtual {
    address constant usdt = address(0x00a329C0648769a73AFac7f9381E08FB43dbeA73);
    address constant btc = address(0x00a329c0648769A73afac7F9381E08Fb43DBeA74);
    address constant eth = address(0x00A329C0648769a73AFAC7f9381e08FB43DBEA75);

    constructor()
        public
        // uint256 owner = 0x00a329C0648769a73afAC7F9381e08fb43DBEA70;
        WooPPVirtual(usdt, 0x00a329C0648769a73afAC7F9381e08fb43DBEA70, address(0))
    {
        Wooracle _wooracle = new Wooracle();
        _wooracle.setQuoteAddr(usdt);
        _wooracle.postState(btc, 50000 * 1e18, 1e10, 1e15);
        _wooracle.postState(eth, 3000 * 1e18, 1e10, 1e15);
        wooracle = address(_wooracle);

        addBaseToken(btc, 0, 0, 1e18, address(0));
        addBaseToken(eth, 0, 0, 1e18, address(0));

        setVirtualBalance(usdt, 1e3 * 1e18);
        setVirtualBalance(btc, 1e3 * 1e18);
        setVirtualBalance(eth, 1e3 * 1e18);
    }

    function smartSellBase(address baseToken) external {
        virtualSellBase(baseToken, virtualBalance[baseToken].sub(initialBalance[baseToken]));
    }

    function smartSellQuote(address baseToken) external {
        virtualSellQuote(baseToken, virtualBalance[quoteToken].sub(initialBalance[quoteToken]));
    }

    function echidna_owner() public returns (bool) {
        return _OWNER_ == 0x00a329C0648769a73afAC7F9381e08fb43DBEA70;
    }

    function echidna_balance() public returns (bool) {
        bool bad = (virtualBalance[usdt] <= initialBalance[usdt]) &&
            (virtualBalance[btc] <= initialBalance[btc]) &&
            (virtualBalance[eth] <= initialBalance[eth]) &&
            ((virtualBalance[usdt] < initialBalance[usdt]) ||
                (virtualBalance[btc] < initialBalance[btc]) ||
                (virtualBalance[eth] < initialBalance[eth]));
        return !bad;
    }
}
