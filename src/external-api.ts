import axios from "axios";
import memoize from "memoizee";
import BigNumber from 'bignumber.js';
import { lending } from "./lending.js";
import { IExtendedPoolDataFromApi, INetworkName, IPoolFactory, I1inchSwapData, IDict } from "./interfaces";


const _getPoolsFromApi = memoize(
    async (network: INetworkName, poolFactory: IPoolFactory ): Promise<IExtendedPoolDataFromApi> => {
        const url = `https://api.curve.fi/api/getPools/${network}/${poolFactory}`;
        const response = await axios.get(url, { validateStatus: () => true });
        return response.data.data ?? { poolData: [], tvl: 0, tvlAll: 0 };
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    }
)

const _getAllPoolsFromApi = async (network: INetworkName): Promise<IExtendedPoolDataFromApi[]> => {
    return await Promise.all([
        _getPoolsFromApi(network, "main"),
        _getPoolsFromApi(network, "crypto"),
        _getPoolsFromApi(network, "factory"),
        _getPoolsFromApi(network, "factory-crvusd"),
        _getPoolsFromApi(network, "factory-crypto"),
        _getPoolsFromApi(network, "factory-twocrypto"),
        _getPoolsFromApi(network, "factory-tricrypto"),
        _getPoolsFromApi(network, "factory-stable-ng"),
    ]);
}

export const _getUsdPricesFromApi = async (): Promise<IDict<number>> => {
    const network = lending.constants.NETWORK_NAME;
    const allTypesExtendedPoolData = await _getAllPoolsFromApi(network);
    const priceDict: IDict<Record<string, number>[]> = {};
    const priceDictByMaxTvl: IDict<number> = {};

    for (const extendedPoolData of allTypesExtendedPoolData) {
        for (const pool of extendedPoolData.poolData) {
            const lpTokenAddress = pool.lpTokenAddress ?? pool.address;
            const totalSupply = pool.totalSupply / (10 ** 18);
            if(lpTokenAddress.toLowerCase() in priceDict) {
                priceDict[lpTokenAddress.toLowerCase()].push({
                    price: pool.usdTotal && totalSupply ? pool.usdTotal / totalSupply : 0,
                    tvl: pool.usdTotal,
                })
            } else {
                priceDict[lpTokenAddress.toLowerCase()] = []
                priceDict[lpTokenAddress.toLowerCase()].push({
                    price: pool.usdTotal && totalSupply ? pool.usdTotal / totalSupply : 0,
                    tvl: pool.usdTotal,
                })
            }

            for (const coin of pool.coins) {
                if (typeof coin.usdPrice === "number") {
                    if(coin.address.toLowerCase() in priceDict) {
                        priceDict[coin.address.toLowerCase()].push({
                            price: coin.usdPrice,
                            tvl: pool.usdTotal,
                        })
                    } else {
                        priceDict[coin.address.toLowerCase()] = []
                        priceDict[coin.address.toLowerCase()].push({
                            price: coin.usdPrice,
                            tvl: pool.usdTotal,
                        })
                    }
                }
            }

            for (const coin of pool.gaugeRewards ?? []) {
                if (typeof coin.tokenPrice === "number") {
                    if(coin.tokenAddress.toLowerCase() in priceDict) {
                        priceDict[coin.tokenAddress.toLowerCase()].push({
                            price: coin.tokenPrice,
                            tvl: pool.usdTotal,
                        });
                    } else {
                        priceDict[coin.tokenAddress.toLowerCase()] = []
                        priceDict[coin.tokenAddress.toLowerCase()].push({
                            price: coin.tokenPrice,
                            tvl: pool.usdTotal,
                        });
                    }
                }
            }
        }
    }

    for(const address in priceDict) {
        if(priceDict[address].length > 0) {
            const maxTvlItem = priceDict[address].reduce((prev, current) => {
                if (+current.tvl > +prev.tvl) {
                    return current;
                } else {
                    return prev;
                }
            });
            priceDictByMaxTvl[address] = maxTvlItem.price
        } else {
            priceDictByMaxTvl[address] = 0
        }

    }

    return priceDictByMaxTvl
}

export const _getUserCollateral = memoize(
    async (network: INetworkName, controller: string, user: string, collateralDecimals = 18): Promise<string> => {
        const url = `https://prices.curve.fi/v1/lending/collateral_events/${network}/${controller}/${user}`;
        const response = await axios.get(url, { validateStatus: () => true });
        return lending.formatUnits(lending.parseUnits(response.data.total_collateral ?? "0.0", 0), collateralDecimals);
    },
    {
        promise: true,
        maxAge: 60 * 1000, // 1m
    }
)

export const _getExpected1inch = memoize(
    async (fromToken: string, toToken: string, _amount: bigint): Promise<string> => {
        if (_amount === BigInt(0)) return "0.0";
        const url = `https://prices.curve.fi/1inch/swap/v6.0/${lending.chainId}/quote?src=${fromToken}&dst=${toToken}&amount=${_amount}&excludedProtocols=${lending.constants.EXCLUDED_PROTOCOLS_1INCH}&includeTokensInfo=true&includeProtocols=true`;
        const response = await axios.get(
            url,
            {
                headers: {"accept": "application/json"},
                validateStatus: () => true,
            });
        if (response.status !== 200) {
            throw Error(`1inch error: ${response.status} ${response.statusText}`);
        }
        return response.data.dstAmount;

    },
    {
        promise: true,
        maxAge: 10 * 1000, // 10s
    }
)

export const _getSwapData1inch = memoize(
    async (fromToken: string, toToken: string, _amount: bigint, slippage: number): Promise<I1inchSwapData> => {
        if (_amount === BigInt(0)) throw Error("Amount must be > 0");
        const url = `https://prices.curve.fi/1inch/swap/v6.0/${lending.chainId}/swap?src=${fromToken}&dst=${toToken}&amount=${_amount}&from_=${lending.constants.ALIASES.leverage_zap}&slippage=${slippage}&excludedProtocols=${lending.constants.EXCLUDED_PROTOCOLS_1INCH}&includeTokensInfo=true&includeProtocols=true&disableEstimate=true`;
        const response = await axios.get(
            url,
            {
                headers: {"accept": "application/json"},
                validateStatus: () => true,
            });
        if (response.status !== 200) {
            throw Error(`1inch error: ${response.status} ${response.statusText}`);
        }
        return response.data;

    },
    {
        promise: true,
        maxAge: 10 * 1000, // 10s
    }
)

export const _getSpotPrice1inch = memoize(
    async (fromToken: string, toToken: string): Promise<string | undefined> => {
        const url = `https://prices.curve.fi/1inch/price/v1.1/${lending.chainId}?tokens=${fromToken},${toToken}&currency=USD`;
        console.log(url)
        const response = await axios.get(
            url,
            {
                headers: {"accept": "application/json"},
                validateStatus: () => true,
            });
        if (response.status !== 200) {
            throw Error(`1inch error: ${response.status} ${response.statusText}`);
        }
        const pricesFromApi: IDict<string> = {};
        for (const coin in response.data) {
            if (response.data[coin] !== "0") continue;
            const _pricesFromApi = await _getUsdPricesFromApi();
            pricesFromApi[coin] = String(_pricesFromApi[coin] || 0);
        }
        const prices = { ...response.data, ...pricesFromApi };
        if (prices[fromToken] === '0' || prices[toToken] === '0') return undefined;

        return (new BigNumber(prices[toToken])).div(prices[fromToken]).toString()
    },
    {
        promise: true,
        maxAge: 10 * 1000, // 10s
    }
)
