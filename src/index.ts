import { ethers, Networkish } from "ethers";
import { OneWayMarketTemplate, getOneWayMarket } from "./markets/index.js";
import { lending as _lending } from "./lending.js";
//import { getBalances, getAllowance, hasAllowance, ensureAllowanceEstimateGas, ensureAllowance, getUsdRate, totalSupply } from "./utils";


async function init (
    providerType: 'JsonRpc' | 'Web3' | 'Infura' | 'Alchemy',
    providerSettings: { url?: string, privateKey?: string, batchMaxCount? : number } | { externalProvider: ethers.Eip1193Provider } | { network?: Networkish, apiKey?: string },
    options: { gasPrice?: number, maxFeePerGas?: number, maxPriorityFeePerGas?: number, chainId?: number } = {}
): Promise<void> {
    await _lending.init(providerType, providerSettings, options);
    // @ts-ignore
    this.signerAddress = _lending.signerAddress;
    // @ts-ignore
    this.chainId = _lending.chainId;
}

function setCustomFeeData (customFeeData: { gasPrice?: number, maxFeePerGas?: number, maxPriorityFeePerGas?: number }): void {
    _lending.setCustomFeeData(customFeeData);
}

const lending = {
    init,
    chainId: 0,
    signerAddress: '',
    OneWayMarketTemplate,
    getOneWayMarket,
    setCustomFeeData,
    //getBalances,
    //getAllowance,
    //hasAllowance,
    //ensureAllowance,
    //getUsdRate,
    //totalSupply,
    factory: {
        fetchMarkets:  _lending.fetchMarkets,
    },
    estimateGas: {
        //ensureAllowance: ensureAllowanceEstimateGas,
    },
}

export default lending;
