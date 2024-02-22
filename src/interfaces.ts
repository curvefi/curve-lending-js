import { Contract, ethers } from "ethers";
import { Contract as MulticallContract, Provider as MulticallProvider } from "ethcall";

export interface IDict<T> {
    [index: string]: T,
}

export type INetworkName = "ethereum" | "bsc" | "optimism" | "xdai" | "polygon" | "fantom" | "zksync" | "moonbeam" | "kava" | "base" | "arbitrum" | "celo" | "avalanche" | "aurora";
export type IChainId = 1 | 10 | 56 | 100 | 137 | 250 | 324 | 1284 | 2222 | 8453 | 42161 | 42220 | 43114 | 1313161554;
export type IPoolFactory = "main" | "crypto" | "factory" | "factory-crvusd" | "factory-crypto" | "factory-tricrypto" | "factory-stable-ng";
export interface ICurveContract {
    contract: Contract,
    multicallContract: MulticallContract,
    abi: any,
    address: string
}

export type TAmount = number | string
export type TGas = number | number[]

export interface ILlamma {
    amm_address: string,
    controller_address: string,
    monetary_policy_address: string,
    collateral_address: string,
    leverage_zap: string,
    deleverage_zap: string,
    health_calculator_zap?: string,
    collateral_symbol: string,
    collateral_decimals: number,
    min_bands: number,
    max_bands: number,
    default_bands: number,
    A: number,
    monetary_policy_abi: any
}

export interface ICoin {
    address: string,
    name: string,
    symbol: string,
    decimals: number,
}

export interface IOneWayMarket {
    name: string,
    addresses: {
        amm: string,
        controller: string,
        borrowed_token: string,
        collateral_token: string,
        monetary_policy: string,
        vault: string,
        gauge: string,
    },
    borrowed_token: ICoin,
    collateral_token: ICoin,
}

export interface ILending {
    provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
    multicallProvider: MulticallProvider,
    signer: ethers.Signer | null,
    signerAddress: string,
    contracts: { [index: string]: { contract: Contract, multicallContract: MulticallContract } },
    feeData: { gasPrice?: number, maxFeePerGas?: number, maxPriorityFeePerGas?: number },
    constantOptions: { gasLimit: number },
    options: { gasPrice?: number | bigint, maxFeePerGas?: number | bigint, maxPriorityFeePerGas?: number | bigint },
    constants: {
        ONE_WAY_MARKETS: IDict<IOneWayMarket>,
        DECIMALS: IDict<number>;
        NETWORK_NAME: INetworkName;
        ALIASES: Record<string, string>;
        COINS: Record<string, string>;
    };
}

export interface ICoinFromPoolDataApi {
    address: string,
    symbol: string,
    decimals: string,
    usdPrice: number | string,
}

export interface IReward {
    gaugeAddress: string,
    tokenAddress: string,
    tokenPrice?: number,
    name?: string,
    symbol: string,
    decimals?: number,
    apy: number
}

export interface IPoolDataFromApi {
    id: string,
    name: string,
    symbol: string,
    assetTypeName: string,
    address: string,
    lpTokenAddress?: string,
    gaugeAddress?: string,
    implementation: string,
    implementationAddress: string,
    coins: ICoinFromPoolDataApi[],
    gaugeRewards?: IReward[],
    usdTotal: number,
    totalSupply: number,
    amplificationCoefficient: string,
}

export interface IExtendedPoolDataFromApi {
    poolData: IPoolDataFromApi[],
    tvl?: number,
    tvlAll: number,
}

