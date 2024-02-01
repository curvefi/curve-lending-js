import { ethers, Contract, Networkish, BigNumberish, Numeric } from "ethers";
import { Provider as MulticallProvider, Contract as MulticallContract } from 'ethcall';
import {IChainId, ILending, IDict, INetworkName} from "./interfaces";
import oneWayLendingFactoryABI from "./constants/abis/oneWayLendingFactoryABI.json"
import vaultABI from "./constants/abis/vaultABI.json"

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


class Lending implements ILending {
    address: string;
    provider: ethers.BrowserProvider | ethers.JsonRpcProvider;
    multicallProvider: MulticallProvider;
    signer: ethers.Signer | null;
    signerAddress: string;
    chainId: IChainId;
    contracts: { [index: string]: { contract: Contract, multicallContract: MulticallContract } };
    feeData: { gasPrice?: number, maxFeePerGas?: number, maxPriorityFeePerGas?: number };
    constantOptions: { gasLimit: number };
    options: { gasPrice?: number | bigint, maxFeePerGas?: number | bigint, maxPriorityFeePerGas?: number | bigint };
    constants: {
        DECIMALS: string;
        WETH: number;
        LLAMMAS: any;
        ALIASES: Record<string, string>;
        NETWORK_NAME: INetworkName;
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
            LLAMMAS: '',
            ALIASES: {},
            NETWORK_NAME: 'ethereum',
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

        this.setContract(this.constants.ALIASES['one_way_factory'], oneWayLendingFactoryABI);
        this.setContract('0x1b85FdF2AFB3Ecb48B1A675BfEB2E2906faefc9e', vaultABI)
    }

    setContract(address: string, abi: any): void {
        this.contracts[address] = {
            contract: new Contract(address, abi, this.signer || this.provider),
            multicallContract: new MulticallContract(address, abi),
        }
    }

    setCustomFeeData(customFeeData: { gasPrice?: number, maxFeePerGas?: number, maxPriorityFeePerGas?: number }): void {
        this.feeData = { ...this.feeData, ...customFeeData };
    }

    //getLlammaList = () => Object.keys(this.constants.LLAMMAS);

    fetchMarkets = async () => {
        const factoryContract = this.contracts[this.constants.ALIASES['one_way_factory']].contract;
        const factoryMulticallContract = this.contracts[this.constants.ALIASES['one_way_factory']].multicallContract;
        console.log(factoryContract)
        const ww = this.contracts['0x1b85FdF2AFB3Ecb48B1A675BfEB2E2906faefc9e'];
        const bib = await ww.contract.name();
        console.log(ww, bib)
        const markets_count = await factoryContract.market_count();

        const callsMap = ['amms', 'controllers', 'borrowed_tokens', 'collateral_tokens', 'price_oracles', 'monetary_policies', 'vaults', 'gauges']

        const calls = [];
        for (let i = 0; i < markets_count; i++) {
            calls.push(factoryMulticallContract.amms[i]);
            calls.push(factoryMulticallContract.controllers[i]);
            calls.push(factoryMulticallContract.borrowed_tokens[i]);
            calls.push(factoryMulticallContract.collateral_tokens[i]);
            calls.push(factoryMulticallContract.price_oracles[i]);
            calls.push(factoryMulticallContract.monetary_policies[i]);
            calls.push(factoryMulticallContract.vaults[i]);
            calls.push(factoryMulticallContract.gauges[i]);
            /*callsMap.forEach((item) => {
                calls.push(factoryMulticallContract[`${item}(${i})`])
            })*/
        }

        const res = await this.multicallProvider.all(calls);

        const handleResponse = (callsMap: string[], response: any[]) => {
            const result: Record<string, any> = {};
            const responseLength = callsMap.length;
            for(let i = 0; i < responseLength; i++) {
                result[callsMap[i]] = response.filter((a, j) => j % responseLength === i) as string[];
            }
        }

        return handleResponse(callsMap, res)
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
