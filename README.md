# CURVE LENDING JS

## Setup

Install from npm:

`npm install @curvefi/lending-api`

## Init
```ts
import lending from "@curvefi/lending-api";

(async () => {
    // 1. Dev
    await lending.init('JsonRpc', {url: 'http://localhost:8545/', privateKey: ''}, { gasPrice: 0, maxFeePerGas: 0, maxPriorityFeePerGas: 0, chainId: 1 });
    // OR
    await lending.init('JsonRpc', {}, {}); // In this case JsonRpc url, privateKey, fee data and chainId will be specified automatically

    // 2. Infura
    lending.init("Infura", { network: "homestead", apiKey: <INFURA_KEY> }, { chainId: 1 });
    
    // 3. Web3 provider
    lending.init('Web3', { externalProvider: <WEB3_PROVIDER> }, { chainId: 1 });
})()
```
**Note 1.** ```chainId``` parameter is optional, but you must specify it in the case you use Metamask on localhost network, because Metamask has that [bug](https://hardhat.org/metamask-issue.html)

**Note 2.** Web3 init requires the address. Therefore, it can be initialized only after receiving the address.

**Wrong ❌️**
```tsx
import type { FunctionComponent } from 'react'
import { useState, useMemo } from 'react'
import { providers } from 'ethers'
import Onboard from 'bnc-onboard'
import type { Wallet } from 'bnc-onboard/dist/src/interfaces'
import lending from '@curvefi/lending-api'

    ...

const WalletProvider: FunctionComponent = ({ children }) => {
    const [wallet, setWallet] = useState<Wallet>()
    const [provider, setProvider] = useState<providers.Web3Provider>()
    const [address, setAddress] = useState<string>()

    const networkId = 1

    const onboard = useMemo(
        () =>
            Onboard({
                dappId: DAPP_ID,
                networkId,

                subscriptions: {
                    address: (address) => {
                        setAddress(address)
                    },

                    wallet: (wallet) => {
                        setWallet(wallet)
                        if (wallet.provider) {
                            lending.init("Web3", { externalProvider: wallet.provider }, { chainId: networkId })
                        }
                    },
                },
                walletSelect: {
                    wallets: wallets,
                },
            }),
        []
    )

    ...
```

**Right ✔️**
```tsx
import type { FunctionComponent } from 'react'
import { useState, useMemo, useEffect } from 'react'
import { providers } from 'ethers'
import Onboard from 'bnc-onboard'
import type { Wallet } from 'bnc-onboard/dist/src/interfaces'
import lending from '@curvefi/lending-api'

    ...

const WalletProvider: FunctionComponent = ({ children }) => {
    const [wallet, setWallet] = useState<Wallet>()
    const [provider, setProvider] = useState<providers.Web3Provider>()
    const [address, setAddress] = useState<string>()

    const networkId = 1

    const onboard = useMemo(
        () =>
            Onboard({
                dappId: DAPP_ID,
                networkId,

                subscriptions: {
                    address: (address) => {
                        setAddress(address)
                    },

                    wallet: (wallet) => {
                        setWallet(wallet)
                    },
                },
                walletSelect: {
                    wallets: wallets,
                },
            }),
        []
    )

    useEffect(() => {
        if (address && wallet?.provider) {
            lending.init("Web3", { externalProvider: wallet.provider }, { chainId: networkId })
        }
    }, [address, wallet?.provider]);

    ...
```

## Notes
- 1 Amounts can be passed in args either as numbers or strings.
- 2 oneWayMarket.swap**PriceImpact** method returns %, e. g. 0 < priceImpact <= 100.
- 3 Slippage arg should be passed as %, e. g. 0 < slippage <= 100.



## General methods
```ts
import lending from "@curvefi/lending-api";

(async () => {
    await lending.init('JsonRpc', {});

    const balances1 = await lending.getBalances(['sdt', 'weth']);
    // OR const balances1 = await lending.getBalances(['0x361a5a4993493ce00f61c32d4ecca5512b82ce90', '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619']);
    //['80980.0', '99.0']

    // You can specify address
    const balances2 = await lending.getBalances(['sdt', 'weth'], "0x0063046686E46Dc6F15918b61AE2B121458534a5");
    // OR const balances2 = await lending.getBalances(['0x361a5a4993493ce00f61c32d4ecca5512b82ce90', '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'], '0x0063046686E46Dc6F15918b61AE2B121458534a5');
    //['0.0', '0.0']

    const spender = "0x136e783846ef68C8Bd00a3369F787dF8d683a696"

    await lending.getAllowance(['sdt', 'weth'], lending.signerAddress, spender);
    //['0.0', '0.0']
    await lending.hasAllowance(['sdt', 'weth'], ['1000', '1000'], lending.signerAddress, spender);
    //false
    await lending.ensureAllowance(['sdt', 'weth'], ['1000', '1000'], spender);
    //['0xab21975af93c403fff91ac50e3e0df6a55b59c3003b34e9900821f5fa19e5454', '0xb6e10a2975adbde7dfb4263c0957dcce6c28cbe7a862f285bb4bda43cca8d62d']

    await lending.getUsdRate('0x7ceb23fd6bc0add59e62ac25578270cff1b9f619');
    //2637.61
})()
```

## oneWayMarket

### oneWayMarket fields
```ts
import lending from "@curvefi/lending-api";

(async () => {
    await lending.init('JsonRpc', {});

    const oneWayMarket = lending.getOneWayMarket('one-way-market-0');

    oneWayMarket.id
    //"one-way-market-0"
    oneWayMarket.addresses
    //
    {
        amm: "0x78f7f91dce40269df106a189e47f27bab561332b"
        borrowed_token: "0x361a5a4993493ce00f61c32d4ecca5512b82ce90"
        collateral_token: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"
        controller: "0xe27dda8e706f41ca0b496e6cf1b7f1e8308e6732"
        gauge: "0x0000000000000000000000000000000000000000"
        monetary_policy: "0xa845d0688745db0f377a6c5bf5fcde0a3a1a6aeb"
        vault: "0x42526886adb3b20a23a5a19c04e4bf81e9febb2b"
    }
    //
    oneWayMarket.borrowed_token
    //
    {
        address: "0x361a5a4993493ce00f61c32d4ecca5512b82ce90"
        decimals: 18
        name: "Stake DAO Token (PoS)"
        symbol: "SDT"
    }
    //
    oneWayMarket.collateral_token
    //
    {
        address: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"
        decimals: 18
        name: "Wrapped Ether"
        symbol: "WETH"
    }
    //
    oneWayMarket.coinAddresses
    //
    ["0x361a5a4993493ce00f61c32d4ecca5512b82ce90",
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"]
    //
    oneWayMarket.coinDecimals
    //
    [18,18]
    //
    oneWayMarket.defaultBands
    //10
    oneWayMarket.maxBands
    //50
    oneWayMarket.minBands
    //4
})()
````

### Wallet balances for oneWayMarket
```ts
import lending from "@curvefi/lending-api";

(async () => {
    await lending.init('JsonRpc', {});
    await lending.oneWayfactory.fetchMarkets();

    const oneWayMarket = lending.getOneWayMarket('one-way-market-0');

    // 1. Current address (signer) balances
    console.log(await oneWayMarket.wallet.balances());
    //
    {
        borrowed: "100000.0"
        collateral: "100.0"
        vaultShares: "0.0"
    }
    //

    // 2. You can specify the address
    console.log(await oneWayMarket.wallet.balances("0x0063046686E46Dc6F15918b61AE2B121458534a5"));
    //
    {
        borrowed: "0.0"
        collateral: "0.0"
        vaultShares: "0.0"
    }
    //
})()
```

### Stats
```ts
import lending from "@curvefi/lending-api";

(async () => {
    await lending.init('JsonRpc', {});

    await lending.oneWayfactory.fetchMarkets();

    const oneWayMarket = lending.getOneWayMarket('one-way-market-0');

    await oneWayMarket.stats.parameters();
    //
    {
        A: "100"
        admin_fee: "0.0"
        base_price: "8595.062092132517715849"
        fee: "0.6"
        future_rate: "0.501252083027981"
        liquidation_discount: "6.0"
        loan_discount: "9.0"
        rate: "0"
    }
    //
    await oneWayMarket.stats.balances();
    //['0.0', '0.0']
    await oneWayMarket.stats.maxMinBands();
    //[0,0]
    await oneWayMarket.stats.activeBand();
    //0
    const liquidatingBand = await oneWayMarket.stats.liquidatingBand();
    console.log(liquidatingBand);
    //null
    await oneWayMarket.stats.bandBalances(liquidatingBand ?? 0);
    //
    {
        borrowed: "0.0"
        collateral: "0.0"
    }
    //
    await oneWayMarket.stats.bandsBalances();
    // {
    //     '0': { borrowed: '0.0', collateral: '0.0' },
    //     '1': { borrowed: '0.0', collateral: '0.0' },
    //     '2': { borrowed: '0.0', collateral: '0.0' },
    //     '3': { borrowed: '0.0', collateral: '0.0' },
    //     '4': { borrowed: '0.0', collateral: '0.0' },
    //     '5': { borrowed: '0.0', collateral: '0.0' },
    //     '6': { borrowed: '0.0', collateral: '0.0' },
    //     '7': { borrowed: '0.0', collateral: '0.0' },
    //     '8': { borrowed: '0.0', collateral: '0.0' },
    //     '9': { borrowed: '0.0', collateral: '0.0' },
    //     '10': { borrowed: '0.0', collateral: '0.0' },
    //     '11': { borrowed: '0.0', collateral: '0.0' },
    //     '12': { borrowed: '0.0', collateral: '0.1' },
    //     '13': { borrowed: '0.0', collateral: '0.1' },
    //     '14': { borrowed: '0.0', collateral: '0.1' },
    //     '15': { borrowed: '0.0', collateral: '0.1' }
    // }
    await oneWayMarket.stats.totalBorrowed();
    //1000
    await oneWayMarket.stats.totalDebt();
    //1000.0
    await oneWayMarket.stats.ammBalances();
    //
    {
        borrowed: "0"
        collateral: "0"
    }
    //
    await oneWayMarket.stats.capAndAvailable();
    //
    {
        available: "0.0"
        cap: "0.0"
    }
    //
})()
````


### Vault: deposit, mint, withdraw, redeem
```ts
    await lending.init('JsonRpc', {});

    await lending.oneWayfactory.fetchMarkets();

    const oneWayMarket = lending.getOneWayMarket('one-way-market-0');


    await oneWayMarket.wallet.balances();
    //
    {
        borrowed: "100000.0"
        collateral: "100.0"
        vaultShares: "0.0"
    }
    //
    await oneWayMarket.vault.maxDeposit();
    //100000.0
    await oneWayMarket.vault.previewDeposit(20000);  // Shares to receive
    //20000000.0
    await oneWayMarket.vault.depositIsApproved(20000);
    //false
    await oneWayMarket.vault.depositApprove(20000);
    //['0x18633be4d60d0afaa8dbbe63eb124ddbcd1fd7f8cc34ae16ef7ad34f4ffe1a53']
    await oneWayMarket.vault.deposit(20000);
    //0xbdc8bdc64fcf560aa9fbf8cf43a1f24dd54cb5c77a88c3a2a8b4408f2d409e2b
    await oneWayMarket.wallet.balances();
    //
    {
        borrowed: "80000.0"
        collateral: "100.0"
        vaultShares: "20000000.0"
    }
    //

    await oneWayMarket.vault.maxMint();
    //80000000.0
    await oneWayMarket.vault.previewMint(20000);  // Assets to send
    //20.0
    await oneWayMarket.vault.mintIsApproved(20000);
    //true
    await oneWayMarket.vault.mintApprove(20000);
    //[]
    await oneWayMarket.vault.mint(20000);
    //0x9e34e201edaeacd27cb3013e003d415c110f562ad105e587f7c8fb0c3b974142

    await oneWayMarket.wallet.balances();
    //
    {
        borrowed: "79980.0"
        collateral: "100.0"
        vaultShares: "20020000.0"
    }
    //

    await oneWayMarket.vault.maxWithdraw();
    //20020.0
    await oneWayMarket.vault.previewWithdraw(10000);  // Shares to send
    //10000000.0
    await oneWayMarket.vault.withdraw(10000);
    //0xa8df19e420040dc21e60f1a25eedec01fead748e2d654100ca3e2d0e369a7ae0

    await oneWayMarket.wallet.balances();
    //
    {
        borrowed: "89980.0"
        collateral: "100.0"
        vaultShares: "10020000.0"
    }
    //

    await oneWayMarket.vault.maxRedeem();
    //10020000.0
    await oneWayMarket.vault.previewRedeem(10000);  // Assets to receive
    //10.0
    await oneWayMarket.vault.redeem(10000);
    //0x391721baa517170c23819b070532a3429ab3c7a306042615bf8e1983d035e363

    await oneWayMarket.wallet.balances();
    //
    {
        borrowed: "89990.0"
        collateral: "100.0"
        vaultShares: "10010000.0"
    }
    //
````

### Create loan, add collateral, borrow more, repay
```ts
(async () => {
    await lending.init('JsonRpc', {});

    await lending.oneWayfactory.fetchMarkets();

    const oneWayMarket = lending.getOneWayMarket('one-way-market-0');
    
    
    // --- CREATE LOAN ---

    await oneWayMarket.oraclePrice();
    // 3000.0
    await oneWayMarket.price();
    // 3045.569137149127502965
    await oneWayMarket.basePrice();
    // '3000.0'
    await oneWayMarket.wallet.balances();
    // { borrowed: '0.0', collateral: '1.0' }
    await oneWayMarket.createLoanMaxRecv(0.5, 5);
    // 1375.74670276529114147
    await oneWayMarket.createLoanBands(0.5, 1000, 5);
    // [ 36, 32 ]
    await oneWayMarket.createLoanPrices(0.5, 1000, 5);
    // [ '2068.347257607234777', '2174.941007873561634' ]
    await oneWayMarket.createLoanHealth(0.5, 1000, 5);  // FULL
    // 45.191203147616155
    await oneWayMarket.createLoanHealth(0.5, 1000, 5, false);  // NOT FULL
    // 3.9382535412942367
    
    await oneWayMarket.createLoanIsApproved(0.5);
    // false
    await oneWayMarketa.createLoanApprove(0.5);
    // [
    //     '0xc111e471715ae6f5437e12d3b94868a5b6542cd7304efca18b5782d315760ae5'
    // ]
    await oneWayMarket.createLoan(0.5, 1000, 5);

    console.log(await oneWayMarket.userLoanExists());
    //true
    console.log(await oneWayMarket.userState());
    //
    {
        N: "5"
        borrowed: "0.0"
        collateral: "1.0"
        debt: "1000.0"
    }
    //
    console.log(await oneWayMarket.userHealth());  // FULL
    //722.5902543890457276
    console.log(await oneWayMarket.userHealth(false));  // NOT FULL
    //3.4708541149110123
    console.log(await oneWayMarket.userRange());
    //5
    console.log(await oneWayMarket.userBands());
    //[206,,202]
    console.log(await oneWayMarket.userPrices());
    //["1073.332550295331639435","1128.647508360591547283]
    console.log(await oneWayMarket.userBandsBalances());
    //
    {
        202: {collateral: '0.2', borrowed: '0.0'},
        203: {collateral: '0.2', borrowed: '0.0'},
        204: {collateral: '0.2', borrowed: '0.0'},
        205: {collateral: '0.2', borrowed: '0.0'},
        206: {collateral: '0.2', borrowed: '0.0'},
    }
    //

    await oneWayMarket.calcTickPrice(0);
    //8595.062092132517715849
    await oneWayMarket.calcTickPrice(1);
    //8509.111471211192538691
    await oneWayMarket.calcBandPrices(0);
    //['8509.111471211192538691', '8595.062092132517715849']
    await oneWayMarket.calcBandPrices(1);
    //['8424.020356499080613304', '8509.111471211192538691']
    await oneWayMarket.calcRangePct(0);
    //0.000000
    await oneWayMarket.calcRangePct(1);
    //1.000000
    await oneWayMarket.oraclePriceBand();
    //4

    // --- BORROW MORE ---

    await oneWayMarket.borrowMoreMaxRecv(0.1);
    // 650.896043318349376298
    await oneWayMarket.borrowMoreBands(0.1, 500);
    // [ 14, 10 ]
    await oneWayMarket.borrowMorePrices(0.1, 500);
    // [ '2580.175063923865968', '2713.146225026413746' ]
    await oneWayMarket.borrowMoreHealth(0.1, 500);  // FULL
    // 15.200984677843693 %
    await oneWayMarket.borrowMoreHealth(0.1, 500, false);  // NOT FULL
    // 3.7268336789002429 %
    
    await oneWayMarket.borrowMoreIsApproved(0.1);
    // true
    await oneWayMarket.borrowMoreApprove(0.1);
    // []
    
    await oneWayMarket.borrowMore(0.1, 500);

    // Full health: 15.200984677843694 %
    // Not full health: 3.7268336789002439 %
    // Bands: [ 14, 10 ]
    // Prices: [ '2580.175063923865968', '2713.146225026413746' ]
    // State: { collateral: '0.6', borrowed: '0.0', debt: '1500.0' }

    // --- ADD COLLATERAL ---

    await oneWayMarket.addCollateralBands(0.2);
    // [ 43, 39 ]
    await oneWayMarket.addCollateralPrices(0.2);
    // [ '1927.834806254156043', '2027.187147180850842' ]
    await oneWayMarket.addCollateralHealth(0.2);  // FULL
    // 55.2190795613534006
    await oneWayMarket.addCollateralHealth(0.2, false);  // NOT FULL
    // 3.3357274109987789
    
    await oneWayMarket.addCollateralIsApproved(0.2);
    // true
    await oneWayMarket.addCollateralApprove(0.2);
    // []
    
    await oneWayMarket.addCollateral(0.2);  // OR await oneWayMarket.addCollateral(0.2, forAddress);

    // Full health: 55.2190795613534014 %
    // Not full health: 3.3357274109987797 %
    // Bands: [ 43, 39 ]
    // Prices: [ '1927.834806254156043', '2027.187147180850842' ]
    // State: { collateral: '0.8', borrowed: '0.0', debt: '1500.0' }

    // --- REMOVE COLLATERAL ---

    await oneWayMarket.maxRemovable()
    // 0.254841506439755199
    await oneWayMarket.removeCollateralBands(0.1);
    // [ 29, 25 ]
    await oneWayMarket.removeCollateralPrices(0.1);
    // [ '2219.101120164841944', '2333.46407819744091' ]
    await oneWayMarket.removeCollateralHealth(0.1);  // FULL
    // 35.1846612411492316
    await oneWayMarket.removeCollateralHealth(0.1, false);  // NOT FULL
    // 4.0796515570298074
    
    await oneWayMarket.removeCollateral(0.1);

    // Full health: 35.1846612411492326 %
    // Not full health: 4.0796515570298084 %
    // Bands: [ 29, 25 ]
    // Prices: [ '2219.101120164841944', '2333.46407819744091', ]
    // State: { collateral: '0.7', borrowed: '0.0', debt: '1500.0' }

    // --- REPAY ---

    await oneWayMarket.wallet.balances();
    // { borrowed: '1500.0', collateral: '0.3' }

    await oneWayMarket.repayBands(1000);
    // [ 139, 135 ]
    await oneWayMarket.repayPrices(1000);
    // [ '734.595897104762463', '772.453820291837448' ]
    await oneWayMarket.repayHealth(1000);  // FULL
    // 315.2178906180373138
    await oneWayMarket.repayHealth(1000, false);  // NOT FULL
    // 3.3614254588945566
    
    await oneWayMarket.repayIsApproved(1000);
    // true
    await oneWayMarket.repayApprove(1000);
    // []
    await oneWayMarket.repay(1000);

    // Full health: 315.2178906180373149 %
    // Not full health: 3.3614254588945577 %
    // Bands: [ 139, 135 ]
    // Prices: [ '734.595897104762463', '772.453820291837448' ]
    // State: { collateral: '0.7', borrowed: '0.0', debt: '500.0' }

    // --- FULL REPAY ---

    await oneWayMarket.fullRepayIsApproved();
    // true
    await oneWayMarket.fullRepayApprove();
    // []
    await oneWayMarket.fullRepay();

    // Loan exists: false
    // State: { collateral: '0.0', borrowed: '0.0', debt: '0.0' }
})()
```

### Create loan all ranges methods
```ts
    await lending.init('JsonRpc', {});

    const oneWayMarket = lending.getOneWayMarket('one-way-market-0');

    await oneWayMarket.createLoanMaxRecvAllRanges(1);
    // {
    //     '5': '2751.493405530582454486',
    //     '6': '2737.828112577888632315',
    //     '7': '2724.253615257658154585',
    //     '8': '2710.76923397831492797',
    //     '9': '2697.374294577689210021',
    //     '10': '2684.068128277815937982',
    //     '11': '2670.850071640120547429',
    //     '12': '2657.719466520988458715',
    //     '13': '2644.675660027714709155',
    //     '14': '2631.718004474831209682',
    //     '15': '2618.845857340807263461',
    //     '16': '2606.058581225120973696',
    //     '17': '2593.355543805697908653',
    //     '18': '2580.736117796713531552',
    //     '19': '2568.199680906757040338',
    //     '20': '2555.745615797352299399',
    //      
    //      ...
    //
    //     '50': '2217.556229455652339229'
    // }

    await oneWayMarket.createLoanBandsAllRanges(1, 2600);
    // {
    //     '5': [ 10, 6 ],
    //     '6': [ 11, 6 ],
    //     '7': [ 11, 5 ],
    //     '8': [ 12, 5 ],
    //     '9': [ 12, 4 ],
    //     '10': [ 13, 4 ],
    //     '11': [ 13, 3 ],
    //     '12': [ 14, 3 ],
    //     '13': [ 14, 2 ],
    //     '14': [ 15, 2 ],
    //     '15': [ 15, 1 ],
    //     '16': [ 16, 1 ],
    //     '17': null,
    //     '18': null,
    //     '19': null,
    //     '20': null,
    //
    //      ...
    //
    //     '50': null
    // }

    await oneWayMarket.createLoanPricesAllRanges(1, 2600);
    // {
    //     '5': [ '2686.01476277614933533', '2824.440448203' ],
    //     '6': [ '2659.154615148387841976', '2824.440448203' ],
    //     '7': [ '2659.154615148387841976', '2852.9701497' ],
    //     '8': [ '2632.563068996903963557', '2852.9701497' ],
    //     '9': [ '2632.563068996903963557', '2881.78803' ],
    //     '10': [ '2606.237438306934923921', '2881.78803' ],
    //     '11': [ '2606.237438306934923921', '2910.897' ],
    //     '12': [ '2580.175063923865574682', '2910.897' ],
    //     '13': [ '2580.175063923865574682', '2940.3' ],
    //     '14': [ '2554.373313284626918935', '2940.3' ],
    //     '15': [ '2554.373313284626918935', '2970' ],
    //     '16': [ '2528.829580151780649746', '2970' ],
    //     '17': null,
    //     '18': null,
    //     '19': null,
    //     '20': null,
    //
    //      ...
    //
    //     '50': null
    // }
```

### Swap
```ts
(async () => {
    await lending.init('JsonRpc', {});

    const oneWayMarket = lending.getOneWayMarket('one-way-market-0');

    await oneWayMarket.wallet.balances();
    // {
    //     borrowed: '301.533523886491869218',
    //     collateral: '0.860611976623971606'
    // }


    await oneWayMarket.maxSwappable(0, 1);
    // 380.672763174593107707
    await oneWayMarket.swapExpected(0, 1, 100);  // 100 - in_amount
    // 0.03679356627103543 (out_amount)
    await oneWayMarket.swapRequired(0, 1, 0.03679356627103543);  // 0.03679356627103543 - out_amount
    // 100.000000000000000558 (in_amount)
    await oneWayMarket.swapPriceImpact(0, 1, 100);
    // 0.170826
    await oneWayMarket.swapIsApproved(0, 100);
    // true
    await oneWayMarket.swapApprove(0, 100);
    // []
    await oneWayMarket.swap(0, 1, 100, 0.1);

    await oneWayMarket.wallet.balances();
    // {
    //     borrowed: '201.533523886491869218',
    //     collateral: '0.897405542895007036'
    // }
})()
```

### Self-liquidation
```ts
(async () => {
    await lending.init('JsonRpc', {});

    const oneWayMarket = lending.getOneWayMarket('one-way-market-0');

    // Wallet balances: {
    //     borrowed: '301.533523886491869218',
    //     collateral: '0.860611976623971606'
    // }
    // State: {
    //     collateral: '0.139388023376028394',
    //     borrowed: '2751.493405530582315609',
    //     debt: '3053.026929417074184827'
    // }
    
    await oneWayMarket.tokensToLiquidate();
    // 301.533523886491869218
    await oneWayMarket.selfLiquidateIsApproved();
    // true
    await oneWayMarket.selfLiquidateApprove();
    // []
    await oneWayMarket.selfLiquidate(0.1); // slippage = 0.1 %

    // Wallet balances: { borrowed: '0.0', collateral: '1.0' }
    // State: { collateral: '0.0', borrowed: '0.0', debt: '0.0' }
})()
```

### Liquidation
```ts
(async () => {
    await lending.init('JsonRpc', {});

    const oneWayMarket = lending.getOneWayMarket('one-way-market-0');
    const addressToLiquidate = "0x66aB6D9362d4F35596279692F0251Db635165871";

    await oneWayMarket.wallet.balances();
    // Liquidator wallet balances: {
    //     borrowed: '301.533523886491869218',
    //     collateral: '0.860611976623971606'
    // }
    await oneWayMarket.userState(addressToLiquidate);
    // State of the account we are goning to liquidate: {
    //     collateral: '0.139388023376028394',
    //     borrowed: '2751.493405530582315609',
    //     debt: '3053.026929417074184827'
    // }
    
    await oneWayMarket.tokensToLiquidate(addressToLiquidate);
    // 301.533523886491869218
    await oneWayMarket.liquidateIsApproved();
    // true
    await oneWayMarket.liquidateApprove();
    // []
    await oneWayMarket.liquidate(addressToLiquidate, 0.1); // slippage = 0.1 %

    // Liquidator wallet balances: { borrowed: '0.0', collateral: '1.0' }
    // State of liquidated account: { collateral: '0.0', borrowed: '0.0', debt: '0.0' }
})()
```

### User loss
```ts
(async () => {
    await lending.init('JsonRpc', {});

    const oneWayMarket = lending.getoneWayMarket('sfrxeth');

    console.log(await oneWayMarket.userLoss("0x0063046686E46Dc6F15918b61AE2B121458534a5"));
    // {
    //     deposited_collateral: '929.933909709140155529',
    //     current_collateral_estimation: '883.035865972092328038',
    //     loss: '46.898043737047827491',
    //     loss_pct: '5.043158793049750311'
    // }
})()
```