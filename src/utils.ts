import axios from "axios";
import { ethers,  BigNumberish, Numeric } from "ethers";
import { Call } from "ethcall";
import BigNumber from 'bignumber.js';
import {ICurveContract, IDict} from "./interfaces.js";
import { _getPoolsFromApi } from "./external-api";
import { lending } from "./lending.js";
import {JsonFragment} from "ethers/lib.esm";

//export const MAX_ALLOWANCE = ethers.BigNumber.from(2).pow(ethers.BigNumber.from(256)).sub(ethers.BigNumber.from(1));
//export const MAX_ACTIVE_BAND = ethers.BigNumber.from(2).pow(ethers.BigNumber.from(255)).sub(ethers.BigNumber.from(1));
export const MAX_ALLOWANCE = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");  // 2**256 - 1
export const MAX_ACTIVE_BAND = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");  // 2**256 - 1

// Common

export const createCall = (contract: ICurveContract, name: string, params: any[]): Call => {
    const _abi = contract.abi;
    const func = _abi.find((f: JsonFragment) => f.name === name)
    const inputs = func?.inputs || [];
    const outputs = func?.outputs || [];

    return {
        contract: {
            address: contract.address,
        },
        name,
        inputs,
        outputs,
        params,
    }
}

// Formatting numbers

export const _cutZeros = (strn: string): string => {
    return strn.replace(/0+$/gi, '').replace(/\.$/gi, '');
}

export const checkNumber = (n: number | string): number | string => {
    if (Number(n) !== Number(n)) throw Error(`${n} is not a number`); // NaN
    return n
}

export const formatNumber = (n: number | string, decimals = 18): string => {
    n = checkNumber(n);
    const [integer, fractional] = String(n).split(".");

    return !fractional ? integer : integer + "." + fractional.slice(0, decimals);
}

export const formatUnits = (value: BigNumberish, unit?: string | Numeric): string => {
    return ethers.formatUnits(value, unit);
}

export const parseUnits = (value: string, unit?: string | Numeric): bigint => {
    return ethers.parseUnits(value, unit);
}

// bignumber.js

export const BN = (val: number | string): BigNumber => new BigNumber(checkNumber(val));

export const toBN = (n: bigint, decimals = 18): BigNumber => {
    return BN(formatUnits(n, decimals));
}

export const toStringFromBN = (bn: BigNumber, decimals = 18): string => {
    return bn.toFixed(decimals);
}

export const fromBN = (bn: BigNumber, decimals = 18): bigint => {
    return parseUnits(toStringFromBN(bn, decimals), decimals)
}

// -----------------------------------------------------------------------------------------------


export const ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const isEth = (address: string): boolean => address.toLowerCase() === ETH_ADDRESS.toLowerCase();
export const getEthIndex = (addresses: string[]): number => addresses.map((address: string) => address.toLowerCase()).indexOf(ETH_ADDRESS.toLowerCase());


export const _getAddress = (address: string): string => {
    address = address || lending.signerAddress;
    if (!address) throw Error("Need to connect wallet or pass address into args");

    return address
}

export const handleMultiCallResponse = (callsMap: string[], response: any[]) => {
    const result: Record<string, any> = {};
    const responseLength = callsMap.length;
    for(let i = 0; i < responseLength; i++) {
        result[callsMap[i]] = response.filter((a, j) => j % responseLength === i) as string[];
    }
    return result;
}