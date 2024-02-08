import { ethers, Contract, Networkish, BigNumberish, Numeric } from "ethers";
import { Provider as MulticallProvider, Contract as MulticallContract, Call } from 'ethcall';
import { IChainId, ILending, IDict, INetworkName, ICurveContract, IOneWayMarket, ICoin } from "./interfaces";
import OneWayLendingFactoryABI from "./constants/abis/OneWayLendingFactoryABI.json" assert { type: 'json' };
import ERC20ABI from './constants/abis/ERC20.json' assert { type: 'json' };
import LlammaABI from './constants/abis/Llamma.json' assert { type: 'json' };
import ControllerABI from './constants/abis/Controller.json' assert { type: 'json' };
import MonetaryPolicyABI from './constants/abis/MonetaryPolicy.json' assert { type: 'json' };
import VaultABI from './constants/abis/Vault.json' assert { type: 'json' };

import {
    ALIASES_ETHEREUM,
    ALIASES_OPTIMISM,
    ALIASES_POLYGON,
    ALIASES_FANTOM,
    ALIASES_AVALANCHE,
    ALIASES_ARBITRUM,
    ALIASES_XDAI,
    ALIASES_MOONBEAM,
    ALIASES_AURORA,
    ALIASES_KAVA,
    ALIASES_CELO,
    ALIASES_ZKSYNC,
    ALIASES_BASE,
    ALIASES_BSC,
} from "./constants/aliases.js";
import { createCall, handleMultiCallResponse} from "./utils.js";

export const NETWORK_CONSTANTS: { [index: number]: any } = {
    1: {
        NAME: 'ethereum',
        ALIASES: ALIASES_ETHEREUM,
    },
    10: {
        NAME: 'optimism',
        ALIASES: ALIASES_OPTIMISM,
    },
    56: {
        NAME: 'bsc',
        ALIASES: ALIASES_BSC,
    },
    100: {
        NAME: 'xdai',
        ALIASES: ALIASES_XDAI,
    },
    137: {
        NAME: 'polygon',
        ALIASES: ALIASES_POLYGON,
    },
    250: {
        NAME: 'fantom',
        ALIASES: ALIASES_FANTOM,
    },
    324: {
        NAME: 'zksync',
        ALIASES: ALIASES_ZKSYNC,
    },
    1284: {
        NAME: 'moonbeam',
        ALIASES: ALIASES_MOONBEAM,
    },
    2222: {
        NAME: 'kava',
        ALIASES: ALIASES_KAVA,
    },
    8453: {
        NAME: 'base',
        ALIASES: ALIASES_BASE,
    },
    42161: {
        NAME: 'arbitrum',
        ALIASES: ALIASES_ARBITRUM,
    },
    42220: {
        NAME: 'celo',
        ALIASES: ALIASES_CELO,
    },
    43114: {
        NAME: 'avalanche',
        ALIASES: ALIASES_AVALANCHE,
    },
    1313161554: {
        NAME: 'aurora',
        ALIASES: ALIASES_AURORA,
    },
}

export const test = '';

class Lending implements ILending {
    address: string;
    provider: ethers.BrowserProvider | ethers.JsonRpcProvider;
    multicallProvider: MulticallProvider;
    signer: ethers.Signer | null;
    signerAddress: string;
    chainId: IChainId;
    contracts: { [index: string]: ICurveContract };
    feeData: { gasPrice?: number, maxFeePerGas?: number, maxPriorityFeePerGas?: number };
    constantOptions: { gasLimit: number };
    options: { gasPrice?: number | bigint, maxFeePerGas?: number | bigint, maxPriorityFeePerGas?: number | bigint };
    constants: {
        DECIMALS: string;
        WETH: number;
        ONE_WAY_MARKETS: IDict<IOneWayMarket>,
        ALIASES: Record<string, string>;
        NETWORK_NAME: INetworkName;
        COINS: IDict<ICoin>
    };

    constructor() {
        this.address = '00000'//COINS.lending.toLowerCase();
        // @ts-ignore
        this.provider = null;
        this.signer = null;
        this.signerAddress = "";
        this.chainId = 1;
        // @ts-ignore
        this.multicallProvider = null;
        this.contracts = {};
        this.feeData = {}
        this.constantOptions = { gasLimit: 12000000 }
        this.options = {};
        this.constants = {
            DECIMALS: '',
            WETH: 0,
            ONE_WAY_MARKETS: {},
            ALIASES: {},
            NETWORK_NAME: 'ethereum',
            COINS: {},
        };
    }

    async init(
        providerType: 'JsonRpc' | 'Web3' | 'Infura' | 'Alchemy',
        providerSettings: { url?: string, privateKey?: string, batchMaxCount? : number } | { externalProvider: ethers.Eip1193Provider } | { network?: Networkish, apiKey?: string },
        options: { gasPrice?: number, maxFeePerGas?: number, maxPriorityFeePerGas?: number, chainId?: number } = {} // gasPrice in Gwei
    ): Promise<void> {
        // @ts-ignore
        this.provider = null;
        // @ts-ignore
        this.signer = null;
        this.signerAddress = "";
        this.chainId = 1;
        // @ts-ignore
        this.multicallProvider = null;
        this.contracts = {};
        this.feeData = {}
        this.constantOptions = { gasLimit: 12000000 }
        this.options = {};

        // JsonRpc provider
        if (providerType.toLowerCase() === 'JsonRpc'.toLowerCase()) {
            providerSettings = providerSettings as { url: string, privateKey: string, batchMaxCount? : number };

            let jsonRpcApiProviderOptions;
            if ( providerSettings.batchMaxCount ) {
                jsonRpcApiProviderOptions = {
                    batchMaxCount: providerSettings.batchMaxCount,
                };
            }



            if (providerSettings.url) {
                this.provider = new ethers.JsonRpcProvider(providerSettings.url, undefined, jsonRpcApiProviderOptions);
            } else {
                this.provider = new ethers.JsonRpcProvider('http://localhost:8545/', undefined, jsonRpcApiProviderOptions);
            }

            if (providerSettings.privateKey) {
                this.signer = new ethers.Wallet(providerSettings.privateKey, this.provider);
            } else if (!providerSettings.url?.startsWith("https://rpc.gnosischain.com")) {
                try {
                    this.signer = await this.provider.getSigner();
                } catch (e) {
                    this.signer = null;
                }
            }
            // Web3 provider
        } else if (providerType.toLowerCase() === 'Web3'.toLowerCase()) {
            providerSettings = providerSettings as { externalProvider: ethers.Eip1193Provider };
            this.provider = new ethers.BrowserProvider(providerSettings.externalProvider);
            this.signer = await this.provider.getSigner();
            // Infura provider
        } else if (providerType.toLowerCase() === 'Infura'.toLowerCase()) {
            providerSettings = providerSettings as { network?: Networkish, apiKey?: string };
            this.provider = new ethers.InfuraProvider(providerSettings.network, providerSettings.apiKey);
            this.signer = null;
            // Alchemy provider
        } else if (providerType.toLowerCase() === 'Alchemy'.toLowerCase()) {
            providerSettings = providerSettings as { network?: Networkish, apiKey?: string };
            this.provider = new ethers.AlchemyProvider(providerSettings.network, providerSettings.apiKey);
            this.signer = null;
        } else {
            throw Error('Wrong providerType');
        }

        const network = await this.provider.getNetwork();
        console.log("CURVE-LENDING-JS IS CONNECTED TO NETWORK:", { name: network.name.toUpperCase(), chainId: Number(network.chainId) });
        this.chainId = Number(network.chainId) === 133 || Number(network.chainId) === 31337 ? 1 : Number(network.chainId) as IChainId;

        this.constants.NETWORK_NAME = NETWORK_CONSTANTS[this.chainId].NAME;
        this.constants.ALIASES = NETWORK_CONSTANTS[this.chainId].ALIASES;

        this.multicallProvider = new MulticallProvider(this.chainId, this.provider);

        if (this.signer) {
            try {
                this.signerAddress = await this.signer.getAddress();
            } catch (err) {
                this.signer = null;
            }
        } else {
            this.signerAddress = '';
        }

        this.feeData = { gasPrice: options.gasPrice, maxFeePerGas: options.maxFeePerGas, maxPriorityFeePerGas: options.maxPriorityFeePerGas };
        await this.updateFeeData();

        this.setContract(this.constants.ALIASES['one_way_factory'], OneWayLendingFactoryABI);
    }

    setContract(address: string, abi: any): void {
        this.contracts[address] = {
            contract: new Contract(address, abi, this.signer || this.provider),
            multicallContract: new MulticallContract(address, abi),
            address: address,
            abi: abi,
        }
    }

    setCustomFeeData(customFeeData: { gasPrice?: number, maxFeePerGas?: number, maxPriorityFeePerGas?: number }): void {
        this.feeData = { ...this.feeData, ...customFeeData };
    }

    getOneWayMarketList = () => Object.keys(this.constants.ONE_WAY_MARKETS);

    getFactoryMarketData = async () => {
        const factory = this.contracts[this.constants.ALIASES['one_way_factory']];
        const factoryContract = this.contracts[this.constants.ALIASES['one_way_factory']].contract;
        const markets_count = await factoryContract.market_count();
        const callsMap = ['amms', 'controllers', 'borrowed_tokens', 'collateral_tokens', 'monetary_policies', 'vaults', 'gauges']

        const calls: Call[] = [];
        for (let i = 0; i < markets_count; i++) {
            callsMap.forEach((item) => {
                calls.push(createCall(factory,item, [i]))
            })
        }
        const res = (await this.multicallProvider.all(calls) as string[]).map((addr) => addr.toLowerCase());

        return handleMultiCallResponse(callsMap, res)
    }

    getCoins = async (collateral_tokens: string[], borrowed_tokens: string[]): Promise<IDict<ICoin>> => {
        const calls: Call[] = [];
        const coins = new Set([...collateral_tokens, ...borrowed_tokens])
        const callsMap = ['name', 'decimals', 'symbol']

        coins.forEach((coin:string) => {
            this.setContract(coin, ERC20ABI);
            callsMap.forEach((item) => {
                calls.push(createCall(this.contracts[coin],item, []))
            })
        })

        const res = await this.multicallProvider.all(calls);

        const {name, decimals, symbol} = handleMultiCallResponse(callsMap, res)
        const COINS_DATA: IDict<ICoin> = {}

        Array.from(coins).forEach((coin: string, index: number) => {
            COINS_DATA[coin] = {
                address: coin,
                decimals: Number(decimals[index]),
                name: name[index],
                symbol: symbol[index],
            }
        })

        return COINS_DATA;

    }

    fetchMarkets = async () => {
        const {amms, controllers, borrowed_tokens, collateral_tokens, monetary_policies, vaults, gauges} = await this.getFactoryMarketData()
        this.constants.COINS = await this.getCoins(collateral_tokens, borrowed_tokens);

        amms.forEach((amm: string, index: number) => {
            this.setContract(amms[index], LlammaABI);
            this.setContract(controllers[index], ControllerABI);
            this.setContract(monetary_policies[index], MonetaryPolicyABI);
            this.setContract(vaults[index], VaultABI);
            this.constants.ONE_WAY_MARKETS[`one-way-market-${index}`] = {
                id: `market-${index}`,
                addresses: {
                    amm: amms[index],
                    controller: controllers[index],
                    borrowed_token: borrowed_tokens[index],
                    collateral_token: collateral_tokens[index],
                    monetary_policy: monetary_policies[index],
                    vault: vaults[index],
                    gauge: gauges[index],
                },
                borrowed_token: this.constants.COINS[borrowed_tokens[index]],
                collateral_token: this.constants.COINS[collateral_tokens[index]],
                min_bands: 4,
                max_bands: 50,
            }
        })
    }

    formatUnits(value: BigNumberish, unit?: string | Numeric): string {
        return ethers.formatUnits(value, unit);
    }

    parseUnits(value: string, unit?: string | Numeric): bigint {
        return ethers.parseUnits(value, unit);
    }

    async updateFeeData(): Promise<void> {
        const feeData = await this.provider.getFeeData();
        if (feeData.maxFeePerGas === null || feeData.maxPriorityFeePerGas === null) {
            delete this.options.maxFeePerGas;
            delete this.options.maxPriorityFeePerGas;

            this.options.gasPrice = this.feeData.gasPrice !== undefined ?
                this.parseUnits(this.feeData.gasPrice.toString(), "gwei") :
                (feeData.gasPrice || this.parseUnits("20", "gwei"));
        } else {
            delete this.options.gasPrice;

            this.options.maxFeePerGas = this.feeData.maxFeePerGas !== undefined ?
                this.parseUnits(this.feeData.maxFeePerGas.toString(), "gwei") :
                feeData.maxFeePerGas;
            this.options.maxPriorityFeePerGas = this.feeData.maxPriorityFeePerGas !== undefined ?
                this.parseUnits(this.feeData.maxPriorityFeePerGas.toString(), "gwei") :
                feeData.maxPriorityFeePerGas;
        }
    }
}

export const lending = new Lending();
