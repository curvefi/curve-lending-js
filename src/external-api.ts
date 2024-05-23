import axios from "axios";
import memoize from "memoizee";
import { lending } from "./lending.js";
import { IExtendedPoolDataFromApi, INetworkName, IPoolFactory, I1inchRoute } from "./interfaces";


export const _getPoolsFromApi = memoize(
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

export const _getAllPoolsFromApi = async (network: INetworkName): Promise<IExtendedPoolDataFromApi[]> => {
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
        const url = `https://prices.curve.fi/1inch/swap/v6.0/${lending.chainId}/quote?src=${fromToken}&dst=${toToken}&amount=${_amount}&protocols=${lending.constants.PROTOCOLS_1INCH}&includeTokensInfo=true&includeProtocols=true`;
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
        maxAge: 5 * 1000, // 5s
    }
)

const _getSwapData1inch = memoize(
    async (fromToken: string, toToken: string, _amount: bigint, slippage: number): Promise<{ tx: { data: string }, protocols: I1inchRoute[] }> => {
        if (_amount === BigInt(0)) throw Error("Amount must be > 0");
        const url = `https://prices.curve.fi/1inch/swap/v6.0/${lending.chainId}/swap?src=${fromToken}&dst=${toToken}&amount=${_amount}&from_=${lending.constants.ALIASES.leverage_zap}&slippage=${slippage}&protocols=${lending.constants.PROTOCOLS_1INCH}&includeTokensInfo=true&includeProtocols=true&disableEstimate=true`;
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
        maxAge: 5 * 1000, // 5s
    }
)

export const _getCalldata1inch = async (fromToken: string, toToken: string, _amount: bigint, slippage: number): Promise<string> => {
    const data = await _getSwapData1inch(fromToken, toToken, _amount, slippage);
    return data.tx.data;
}

export const _getRoute1inch = async (fromToken: string, toToken: string, _amount: bigint, slippage: number): Promise<I1inchRoute[]> => {
    const data = await _getSwapData1inch(fromToken, toToken, _amount, slippage);
    return data.protocols;
}
