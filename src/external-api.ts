import axios from "axios";
import memoize from "memoizee";
import { lending } from "./lending.js";
import { IExtendedPoolDataFromApi, INetworkName, IPoolFactory } from "./interfaces";


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

export const _getQuote1inch = memoize(
    async (fromToken: string, toToken: string, _amount: bigint): Promise<string> => {
        if (_amount === BigInt(0)) return "0.0";
        const url = `https://api.1inch.dev/swap/v5.2/1/quote?src=${fromToken}&dst=${toToken}&amount=${_amount}&
        protocols=${lending.constants.PROTOCOLS_1INCH}&includeTokensInfo=true&includeProtocols=true`;
        const response = await axios.get(
            url,
            {
                headers: {"accept": "application/json", "Authorization": `Bearer ${lending.apiKey1inch}`},
                validateStatus: () => true,
            });
        if (response.status !== 200) {
            throw Error(`1inch error: ${response.status} ${response.statusText}`);
        }
        return response.data.toAmount;

    },
    {
        promise: true,
        maxAge: 5 * 1000, // 5s
    }
)
