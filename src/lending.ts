import { ethers,
    Contract, Networkish, BigNumberish, Numeric, AbstractProvider } from "ethers";
import { Provider as MulticallProvider, Contract as MulticallContract, Call } from 'ethcall';
import {
    IChainId,
    ILending,
    IDict,
    INetworkName,
    ICurveContract,
    IOneWayMarket,
    ICoin,
    IMarketDataAPI,
} from "./interfaces.js";
import OneWayLendingFactoryABI from "./constants/abis/OneWayLendingFactoryABI.json" assert { type: 'json' };
import ERC20ABI from './constants/abis/ERC20.json' assert { type: 'json' };
import ERC4626ABI from './constants/abis/ERC4626.json' assert { type: 'json' };
import LlammaABI from './constants/abis/Llamma.json' assert { type: 'json' };
import ControllerABI from './constants/abis/Controller.json' assert { type: 'json' };
import MonetaryPolicyABI from './constants/abis/MonetaryPolicy.json' assert { type: 'json' };
import VaultABI from './constants/abis/Vault.json' assert { type: 'json' };
import GaugeABI from './constants/abis/GaugeV5.json' assert { type: 'json' };
import SidechainGaugeABI from './constants/abis/SidechainGauge.json' assert { type: 'json' };
import GaugeControllerABI from './constants/abis/GaugeController.json' assert { type: 'json' };
import GaugeFactoryMainnetABI from './constants/abis/GaugeFactoryMainnet.json' assert { type: 'json' };
import GaugeFactorySidechainABI from './constants/abis/GaugeFactorySidechain.json' assert { type: 'json' };
import MinterABI from './constants/abis/Minter.json' assert { type: 'json' };
import LeverageZapABI from './constants/abis/LeverageZap.json' assert { type: 'json' };
import gasOracleABI from './constants/abis/gas_oracle_optimism.json' assert { type: 'json'};
import gasOracleBlobABI from './constants/abis/gas_oracle_optimism_blob.json' assert { type: 'json'};
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
    ALIASES_FRAXTAL,
} from "./constants/aliases.js";
import {
    COINS_ETHEREUM,
    COINS_OPTIMISM,
    COINS_POLYGON,
    COINS_FANTOM,
    COINS_AVALANCHE,
    COINS_ARBITRUM,
    COINS_XDAI,
    COINS_MOONBEAM,
    COINS_AURORA,
    COINS_KAVA,
    COINS_CELO,
    COINS_ZKSYNC,
    COINS_BASE,
    COINS_BSC,
    COINS_FRAXTAL,
} from "./constants/coins.js";
import { L2Networks } from "./constants/L2Networks.js";
import { createCall, handleMultiCallResponse} from "./utils.js";
import {cacheKey, cacheStats} from "./cache/index.js";
import {_getMarketsData} from "./external-api.js";

export const NETWORK_CONSTANTS: { [index: number]: any } = {
    1: {
        NAME: 'ethereum',
        ALIASES: ALIASES_ETHEREUM,
        COINS: COINS_ETHEREUM,
        EXCLUDED_PROTOCOLS_1INCH: "CURVE_V2_LLAMMA",
    },
    10: {
        NAME: 'optimism',
        ALIASES: ALIASES_OPTIMISM,
        COINS: COINS_OPTIMISM,
    },
    56: {
        NAME: 'bsc',
        ALIASES: ALIASES_BSC,
        COINS: COINS_BSC,
    },
    100: {
        NAME: 'xdai',
        ALIASES: ALIASES_XDAI,
        COINS: COINS_XDAI,
    },
    137: {
        NAME: 'polygon',
        ALIASES: ALIASES_POLYGON,
        COINS: COINS_POLYGON,
    },
    250: {
        NAME: 'fantom',
        ALIASES: ALIASES_FANTOM,
        COINS: COINS_FANTOM,
    },
    252: {
        NAME: 'fraxtal',
        ALIASES: ALIASES_FRAXTAL,
        COINS: COINS_FRAXTAL,
    },
    324: {
        NAME: 'zksync',
        ALIASES: ALIASES_ZKSYNC,
        COINS: COINS_ZKSYNC,
    },
    1284: {
        NAME: 'moonbeam',
        ALIASES: ALIASES_MOONBEAM,
        COINS: COINS_MOONBEAM,
    },
    2222: {
        NAME: 'kava',
        ALIASES: ALIASES_KAVA,
        COINS: COINS_KAVA,
    },
    8453: {
        NAME: 'base',
        ALIASES: ALIASES_BASE,
        COINS: COINS_BASE,
    },
    42161: {
        NAME: 'arbitrum',
        ALIASES: ALIASES_ARBITRUM,
        COINS: COINS_ARBITRUM,
        EXCLUDED_PROTOCOLS_1INCH: "",
    },
    42220: {
        NAME: 'celo',
        ALIASES: ALIASES_CELO,
        COINS: COINS_CELO,
    },
    43114: {
        NAME: 'avalanche',
        ALIASES: ALIASES_AVALANCHE,
        COINS: COINS_AVALANCHE,
    },
    1313161554: {
        NAME: 'aurora',
        ALIASES: ALIASES_AURORA,
        COINS: COINS_AURORA,
    },
}


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
    L1WeightedGasPrice?: number;
    constants: {
        ONE_WAY_MARKETS: IDict<IOneWayMarket>,
        DECIMALS: IDict<number>;
        NETWORK_NAME: INetworkName;
        ALIASES: Record<string, string>;
        COINS: Record<string, string>;
        ZERO_ADDRESS: string,
        EXCLUDED_PROTOCOLS_1INCH: string,
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
            ONE_WAY_MARKETS: {},
            COINS: {},
            DECIMALS: {},
            NETWORK_NAME: 'ethereum',
            ALIASES: {},
            ZERO_ADDRESS: ethers.ZeroAddress,
            EXCLUDED_PROTOCOLS_1INCH: "",
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
        this.constants = {
            ONE_WAY_MARKETS: {},
            COINS: {},
            DECIMALS: {},
            NETWORK_NAME: 'ethereum',
            ALIASES: {},
            ZERO_ADDRESS: ethers.ZeroAddress,
            EXCLUDED_PROTOCOLS_1INCH: "",
        };

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
        this.chainId = Number(network.chainId) === 133 || Number(network.chainId) === 31337 ? 1 : Number(network.chainId) as IChainId;
        console.log("CURVE-LENDING-JS IS CONNECTED TO NETWORK:", { name: network.name.toUpperCase(), chainId: Number(this.chainId) });

        this.constants.NETWORK_NAME = NETWORK_CONSTANTS[this.chainId].NAME;
        this.constants.ALIASES = NETWORK_CONSTANTS[this.chainId].ALIASES;
        this.constants.COINS = NETWORK_CONSTANTS[this.chainId].COINS;
        this.constants.EXCLUDED_PROTOCOLS_1INCH = NETWORK_CONSTANTS[this.chainId].EXCLUDED_PROTOCOLS_1INCH;
        this.setContract(this.constants.ALIASES.crv, ERC20ABI);
        this.setContract(this.constants.ALIASES.crvUSD, ERC20ABI);
        this.setContract(this.constants.ALIASES.st_crvUSD, ERC4626ABI);
        this.constants.DECIMALS[this.constants.ALIASES.crv] = 18;
        this.constants.DECIMALS[this.constants.ALIASES.crvUSD] = 18;
        this.constants.DECIMALS[this.constants.ALIASES.st_crvUSD] = 18;

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
        this.setContract(this.constants.ALIASES['gauge_controller'], GaugeControllerABI);
        this.setContract(this.constants.ALIASES['leverage_zap'], LeverageZapABI);
        if (this.chainId === 1) {
            this.setContract(this.constants.ALIASES.minter, MinterABI);
            this.setContract(this.constants.ALIASES.gauge_factory, GaugeFactoryMainnetABI);
        } else {
            this.constants.ALIASES.minter = this.constants.ALIASES.gauge_factory;
            this.setContract(this.constants.ALIASES.gauge_factory, GaugeFactorySidechainABI);
        }

        if(L2Networks.includes(this.chainId)) {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const lendingInstance = this;
            lendingInstance.setContract(lendingInstance.constants.ALIASES.gas_oracle, gasOracleABI);
            lendingInstance.setContract(lendingInstance.constants.ALIASES.gas_oracle_blob, gasOracleBlobABI);

            // @ts-ignore
            if(AbstractProvider.prototype.originalEstimate) {
                // @ts-ignore
                AbstractProvider.prototype.estimateGas = AbstractProvider.prototype.originalEstimate;
            }

            const originalEstimate = AbstractProvider.prototype.estimateGas;

            const oldEstimate = async function(arg: any) {
                // @ts-ignore
                const originalEstimateFunc = originalEstimate.bind(this);

                const gas = await originalEstimateFunc(arg);

                return gas;
            }

            //Override
            const newEstimate = async function(arg: any) {
                // @ts-ignore
                const L2EstimateGas = originalEstimate.bind(this);

                const L1GasUsed = await lendingInstance.contracts[lendingInstance.constants.ALIASES.gas_oracle_blob].contract.getL1GasUsed(arg.data);
                const L1Fee = await lendingInstance.contracts[lendingInstance.constants.ALIASES.gas_oracle_blob].contract.getL1Fee(arg.data);

                lendingInstance.L1WeightedGasPrice = Number(L1Fee)/Number(L1GasUsed);

                const L2GasUsed = await L2EstimateGas(arg);

                return [L2GasUsed,L1GasUsed];
            }

            // @ts-ignore
            AbstractProvider.prototype.estimateGas = newEstimate;
            // @ts-ignore
            AbstractProvider.prototype.originalEstimate = oldEstimate;
        } else {
            // @ts-ignore
            if(AbstractProvider.prototype.originalEstimate) {
                // @ts-ignore
                AbstractProvider.prototype.estimateGas = AbstractProvider.prototype.originalEstimate;
            }
        }
    }

    setContract(address: string, abi: any): void {
        if (address === this.constants.ZERO_ADDRESS || address === undefined) return;
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
        const callsMap = ['names', 'amms', 'controllers', 'borrowed_tokens', 'collateral_tokens', 'monetary_policies', 'vaults', 'gauges']

        const calls: Call[] = [];
        for (let i = 0; i < markets_count; i++) {
            callsMap.forEach((item) => {
                calls.push(createCall(factory,item, [i]))
            })
        }
        const res = (await this.multicallProvider.all(calls) as string[]).map((addr) => addr.toLowerCase());

        return handleMultiCallResponse(callsMap, res)
    }

    getFactoryMarketDataByAPI = async () => {
        const apiData = (await _getMarketsData(this.constants.NETWORK_NAME)).lendingVaultData;

        const result: Record<string, string[]> = {
            names: [],
            amms: [],
            controllers: [],
            borrowed_tokens: [],
            collateral_tokens: [],
            monetary_policies: [],
            vaults: [],
            gauges: [],
        };

        apiData.forEach((market: IMarketDataAPI) => {
            result.names.push(market.name);
            result.amms.push(market.ammAddress.toLowerCase());
            result.controllers.push(market.controllerAddress.toLowerCase());
            result.borrowed_tokens.push(market.assets.borrowed.address.toLowerCase());
            result.collateral_tokens.push(market.assets.collateral.address.toLowerCase());
            result.monetary_policies.push(market.monetaryPolicyAddress.toLowerCase());
            result.vaults.push(market.address.toLowerCase());
            result.gauges.push(market.gaugeAddress?.toLowerCase() || this.constants.ZERO_ADDRESS);
        });

        return result;
    }

    getCoins = async (collateral_tokens: string[], borrowed_tokens: string[], useApi = false): Promise<IDict<ICoin>> => {
        const coins = new Set([...collateral_tokens, ...borrowed_tokens]);
        const COINS_DATA: IDict<ICoin> = {};

        if (useApi) {
            const apiData = (await _getMarketsData(this.constants.NETWORK_NAME)).lendingVaultData;
            apiData.forEach((market) => {
                const borrowedCoin = market.assets.borrowed;
                const collateralCoin = market.assets.collateral;

                if (coins.has(borrowedCoin.address)) {
                    this.setContract(borrowedCoin.address, ERC20ABI);
                    COINS_DATA[borrowedCoin.address] = {
                        address: borrowedCoin.address,
                        decimals: borrowedCoin.decimals,
                        name: borrowedCoin.symbol,
                        symbol: borrowedCoin.symbol,
                    };
                }

                if (coins.has(collateralCoin.address)) {
                    this.setContract(collateralCoin.address, ERC20ABI);
                    COINS_DATA[collateralCoin.address] = {
                        address: collateralCoin.address,
                        decimals: collateralCoin.decimals,
                        name: collateralCoin.symbol,
                        symbol: collateralCoin.symbol,
                    };
                }
            });
        } else {
            const calls: Call[] = [];
            const callsMap = ['name', 'decimals', 'symbol'];

            coins.forEach((coin: string) => {
                this.setContract(coin, ERC20ABI);
                callsMap.forEach((item) => {
                    calls.push(createCall(this.contracts[coin], item, []));
                });
            });

            const res = await this.multicallProvider.all(calls);
            const { name, decimals, symbol } = handleMultiCallResponse(callsMap, res);

            Array.from(coins).forEach((coin: string, index: number) => {
                COINS_DATA[coin] = {
                    address: coin,
                    decimals: Number(decimals[index]),
                    name: name[index],
                    symbol: symbol[index],
                };
            });
        }

        return COINS_DATA;
    }


    fetchStats = async (amms: string[], controllers: string[], vaults: string[], borrowed_tokens: string[], collateral_tokens: string[]) => {
        cacheStats.clear();

        const marketCount = controllers.length;

        const calls: Call[] = [];

        for (let i = 0; i < marketCount; i++) {
            calls.push(createCall(this.contracts[controllers[i]], 'total_debt', []));
            calls.push(createCall(this.contracts[vaults[i]], 'totalAssets', [controllers[i]]));
            calls.push(createCall(this.contracts[borrowed_tokens[i]], 'balanceOf', [controllers[i]]));
            calls.push(createCall(this.contracts[amms[i]], 'rate', []));
            calls.push(createCall(this.contracts[borrowed_tokens[i]], 'balanceOf', [amms[i]]));
            calls.push(createCall(this.contracts[amms[i]], 'admin_fees_x', []));
            calls.push(createCall(this.contracts[amms[i]], 'admin_fees_y', []));
            calls.push(createCall(this.contracts[collateral_tokens[i]], 'balanceOf', [amms[i]]));
        }

        const res = await this.multicallProvider.all(calls);

        for (let i = 0; i < marketCount; i++) {
            cacheStats.set(cacheKey(controllers[i], 'total_debt'), res[(i * 8) + 0]);
            cacheStats.set(cacheKey(vaults[i], 'totalAssets', controllers[i]), res[(i * 8) + 1]);
            cacheStats.set(cacheKey(borrowed_tokens[i], 'balanceOf', controllers[i]), res[(i * 8) + 2]);
            cacheStats.set(cacheKey(amms[i], 'rate'), res[(i * 8) + 3]);
            cacheStats.set(cacheKey(borrowed_tokens[i], 'balanceOf', amms[i]), res[(i * 8) + 4]);
            cacheStats.set(cacheKey(amms[i], 'admin_fees_x'), res[(i * 8) + 5]);
            cacheStats.set(cacheKey(amms[i], 'admin_fees_y'), res[(i * 8) + 6]);
            cacheStats.set(cacheKey(collateral_tokens[i], 'balanceOf', amms[i]), res[(i * 8) + 7]);
        }
    };


    fetchOneWayMarkets = async (useAPI = true) => {
        if(useAPI) {
            await this._fetchOneWayMarketsByAPI()
        } else {
            await this._fetchOneWayMarketsByBlockchain()
        }
    }

    _fetchOneWayMarketsByBlockchain = async () => {
        const {names, amms, controllers, borrowed_tokens, collateral_tokens, monetary_policies, vaults, gauges} = await this.getFactoryMarketData()
        const COIN_DATA = await this.getCoins(collateral_tokens, borrowed_tokens);
        for (const c in COIN_DATA) {
            this.constants.DECIMALS[c] = COIN_DATA[c].decimals;
        }

        amms.forEach((amm: string, index: number) => {
            this.setContract(amm, LlammaABI);
            this.setContract(controllers[index], ControllerABI);
            this.setContract(monetary_policies[index], MonetaryPolicyABI);
            this.setContract(vaults[index], VaultABI);
            this.setContract(gauges[index], this.chainId === 1 ? GaugeABI : SidechainGaugeABI);
            COIN_DATA[vaults[index]] = {
                address: vaults[index],
                decimals: 18,
                name: "Curve Vault for " + COIN_DATA[borrowed_tokens[index]].name,
                symbol: "cv" + COIN_DATA[borrowed_tokens[index]].symbol,
            };
            COIN_DATA[gauges[index]] = {
                address: gauges[index],
                decimals: 18,
                name: "Curve.fi " + COIN_DATA[borrowed_tokens[index]].name + " Gauge Deposit",
                symbol: "cv" + COIN_DATA[borrowed_tokens[index]].symbol + "-gauge",
            };
            this.constants.DECIMALS[vaults[index]] = 18;
            this.constants.DECIMALS[gauges[index]] = 18;
            this.constants.ONE_WAY_MARKETS[`one-way-market-${index}`] = {
                name: names[index],
                addresses: {
                    amm: amms[index],
                    controller: controllers[index],
                    borrowed_token: borrowed_tokens[index],
                    collateral_token: collateral_tokens[index],
                    monetary_policy: monetary_policies[index],
                    vault: vaults[index],
                    gauge: gauges[index],
                },
                borrowed_token: COIN_DATA[borrowed_tokens[index]],
                collateral_token: COIN_DATA[collateral_tokens[index]],
            }
        })

        await this.fetchStats(amms, controllers, vaults, borrowed_tokens, collateral_tokens);
    }

    _fetchOneWayMarketsByAPI = async () => {
        const {names, amms, controllers, borrowed_tokens, collateral_tokens, monetary_policies, vaults, gauges} = await this.getFactoryMarketDataByAPI()
        const COIN_DATA = await this.getCoins(collateral_tokens, borrowed_tokens, true);
        for (const c in COIN_DATA) {
            this.constants.DECIMALS[c] = COIN_DATA[c].decimals;
        }

        amms.forEach((amm: string, index: number) => {
            this.setContract(amms[index], LlammaABI);
            this.setContract(controllers[index], ControllerABI);
            this.setContract(monetary_policies[index], MonetaryPolicyABI);
            this.setContract(vaults[index], VaultABI);
            if(gauges[index]){
                this.setContract(gauges[index], this.chainId === 1 ? GaugeABI : SidechainGaugeABI);
            }
            COIN_DATA[vaults[index]] = {
                address: vaults[index],
                decimals: 18,
                name: "Curve Vault for " + COIN_DATA[borrowed_tokens[index]].name,
                symbol: "cv" + COIN_DATA[borrowed_tokens[index]].symbol,
            };
            COIN_DATA[gauges[index]] = {
                address: gauges[index],
                decimals: 18,
                name: "Curve.fi " + COIN_DATA[borrowed_tokens[index]].name + " Gauge Deposit",
                symbol: "cv" + COIN_DATA[borrowed_tokens[index]].symbol + "-gauge",
            };
            this.constants.DECIMALS[vaults[index]] = 18;
            this.constants.DECIMALS[gauges[index]] = 18;
            this.constants.ONE_WAY_MARKETS[`one-way-market-${index}`] = {
                name: names[index],
                addresses: {
                    amm: amms[index],
                    controller: controllers[index],
                    borrowed_token: borrowed_tokens[index],
                    collateral_token: collateral_tokens[index],
                    monetary_policy: monetary_policies[index],
                    vault: vaults[index],
                    gauge: gauges[index],
                },
                borrowed_token: COIN_DATA[borrowed_tokens[index]],
                collateral_token: COIN_DATA[collateral_tokens[index]],
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