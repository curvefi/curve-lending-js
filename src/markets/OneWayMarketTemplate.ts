import memoize from "memoizee";
import BigNumber from "bignumber.js";
import { lending } from "../lending.js";
import {
    _getAddress,
    parseUnits,
    BN,
    toBN,
    fromBN,
    getBalances,
    _ensureAllowance,
    ensureAllowance,
    hasAllowance,
    ensureAllowanceEstimateGas,
    _cutZeros,
    formatUnits,
    formatNumber,
    MAX_ALLOWANCE,
    MAX_ACTIVE_BAND,
    _mulBy1_3,
    _getUsdRate,
    DIGas,
    smartNumber,
} from "../utils.js";
import { IDict, TGas, TAmount, IReward } from "../interfaces.js";
import ERC20Abi from '../constants/abis/ERC20.json' assert { type: 'json' };


const DAY = 86400;
const WEEK = 7 * DAY;


export class OneWayMarketTemplate {
    id: string;
    name: string
    addresses: {
        amm: string,
        controller: string,
        borrowed_token: string,
        collateral_token: string,
        monetary_policy: string,
        vault: string,
        gauge: string,
    };
    borrowed_token: {
        address: string;
        name: string;
        symbol: string;
        decimals: number;
    };
    collateral_token: {
        address: string;
        name: string;
        symbol: string;
        decimals: number;
    }
    coinAddresses: [string, string]
    coinDecimals: [number, number]
    defaultBands: number
    minBands: number
    maxBands: number

    estimateGas: {
        createLoanApprove: (collateral: number | string) => Promise<TGas>,
        createLoan: (collateral: number | string, debt: number | string, range: number) => Promise<TGas>,
        borrowMoreApprove: (collateral: number | string) => Promise<TGas>,
        borrowMore: (collateral: number | string, debt: number | string) => Promise<TGas>,
        addCollateralApprove: (collateral: number | string) => Promise<TGas>,
        addCollateral: (collateral: number | string, address?: string) => Promise<TGas>,
        removeCollateral: (collateral: number | string) => Promise<TGas>,
        repayApprove: (debt: number | string) => Promise<TGas>,
        repay: (debt: number | string, address?: string) => Promise<TGas>,
        fullRepayApprove: (address?: string) => Promise<TGas>,
        fullRepay: (address?: string) => Promise<TGas>,
        swapApprove: (i: number, amount: number | string) => Promise<TGas>,
        swap: (i: number, j: number, amount: number | string, slippage?: number) => Promise<TGas>,
        liquidateApprove: (address: string) => Promise<TGas>,
        liquidate: (address: string, slippage?: number) => Promise<TGas>,
        selfLiquidateApprove: () => Promise<TGas>,
        selfLiquidate: (slippage?: number) => Promise<TGas>,
    };
    stats: {
        parameters: () => Promise<{
            fee: string, // %
            admin_fee: string, // %
            liquidation_discount: string, // %
            loan_discount: string, // %
            base_price: string,
            A: string,
        }>,
        rates: () => Promise<{borrowApr: string, lendApr: string, borrowApy: string, lendApy: string}>,
        futureRates: (dReserves: TAmount, dDebt: TAmount) => Promise<{borrowApr: string, lendApr: string, borrowApy: string, lendApy: string}>,
        balances: () => Promise<[string, string]>,
        bandsInfo: () => Promise<{ activeBand: number, maxBand: number, minBand: number, liquidationBand: number | null }>
        bandBalances:(n: number) => Promise<{ borrowed: string, collateral: string }>,
        bandsBalances: () => Promise<{ [index: number]: { borrowed: string, collateral: string } }>,
        totalBorrowed: () => Promise<string>,
        totalDebt: () => Promise<string>,
        ammBalances: () => Promise<{ borrowed: string, collateral: string }>,
        capAndAvailable: () => Promise<{ cap: string, available: string }>,
    };
    wallet: {
        balances: (address?: string) => Promise<{ collateral: string, borrowed: string, vaultShares: string, gauge: string }>,
    };
    vault: {
        maxDeposit: (address?: string) => Promise<string>,
        previewDeposit: (amount: TAmount) => Promise<string>,
        depositIsApproved: (borrowed: TAmount) => Promise<boolean>
        depositApprove: (borrowed: TAmount) => Promise<string[]>
        deposit: (amount: TAmount) => Promise<string>,
        maxMint: (address?: string) => Promise<string>,
        previewMint: (amount: TAmount) => Promise<string>,
        mintIsApproved: (borrowed: TAmount) => Promise<boolean>
        mintApprove: (borrowed: TAmount) => Promise<string[]>
        mint: (amount: TAmount) => Promise<string>,
        maxWithdraw: (address?: string) => Promise<string>,
        previewWithdraw: (amount: TAmount) => Promise<string>,
        withdraw: (amount: TAmount) => Promise<string>,
        maxRedeem: (address?: string) => Promise<string>,
        previewRedeem: (amount: TAmount) => Promise<string>,
        redeem: (amount: TAmount) => Promise<string>,
        convertToShares: (assets: TAmount) => Promise<string>,
        convertToAssets: (shares: TAmount) => Promise<string>,
        stakeIsApproved: (vaultShares: number | string) => Promise<boolean>,
        stakeApprove: (vaultShares: number | string) => Promise<string[]>,
        stake: (vaultShares: number | string) => Promise<string>,
        unstake: (vaultShares: number | string) => Promise<string>,
        rewardsOnly: () => boolean,
        totalLiquidity: () => Promise<string>,
        crvApr: (useApi?: boolean) => Promise<[baseApy: number, boostedApy: number]>,
        claimableCrv: (address?: string) => Promise<string>,
        claimCrv: () => Promise<string>,
        rewardTokens: (useApi?: boolean) => Promise<{token: string, symbol: string, decimals: number}[]>,
        rewardsApr: (useApi?: boolean) => Promise<IReward[]>,
        claimableRewards: (address?: string) => Promise<{token: string, symbol: string, amount: string}[]>,
        claimRewards: () => Promise<string>,
        estimateGas: {
            depositApprove: (amount: TAmount) => Promise<TGas>,
            deposit: (amount: TAmount) => Promise<TGas>,
            mintApprove: (amount: TAmount) => Promise<TGas>,
            mint: (amount: TAmount) => Promise<TGas>,
            withdraw: (amount: TAmount) => Promise<TGas>,
            redeem: (amount: TAmount) => Promise<TGas>,
            stakeApprove: (vaultShares: number | string) => Promise<TGas>,
            stake: (vaultShares: number | string) => Promise<TGas>,
            unstake: (vaultShares: number | string) => Promise<TGas>,
            claimCrv: () => Promise<TGas>,
            claimRewards: () => Promise<TGas>,
        }
    };

    constructor(id: string) {
        this.id = id;
        const marketData = lending.constants.ONE_WAY_MARKETS[id];
        this.name = marketData.name;
        this.addresses = marketData.addresses;
        this.borrowed_token = marketData.borrowed_token;
        this.collateral_token = marketData.collateral_token;
        this.coinDecimals = [this.borrowed_token.decimals, this.collateral_token.decimals]
        this.coinAddresses = [this.borrowed_token.address, this.collateral_token.address]
        this.defaultBands = 10
        this.minBands = 4
        this.maxBands = 50
        this.estimateGas = {
            createLoanApprove: this.createLoanApproveEstimateGas.bind(this),
            createLoan: this.createLoanEstimateGas.bind(this),
            borrowMoreApprove: this.borrowMoreApproveEstimateGas.bind(this),
            borrowMore: this.borrowMoreEstimateGas.bind(this),
            addCollateralApprove: this.addCollateralApproveEstimateGas.bind(this),
            addCollateral: this.addCollateralEstimateGas.bind(this),
            removeCollateral: this.removeCollateralEstimateGas.bind(this),
            repayApprove: this.repayApproveEstimateGas.bind(this),
            repay: this.repayEstimateGas.bind(this),
            fullRepayApprove: this.fullRepayApproveEstimateGas.bind(this),
            fullRepay: this.fullRepayEstimateGas.bind(this),
            swapApprove: this.swapApproveEstimateGas.bind(this),
            swap: this.swapEstimateGas.bind(this),
            liquidateApprove: this.liquidateApproveEstimateGas.bind(this),
            liquidate: this.liquidateEstimateGas.bind(this),
            selfLiquidateApprove: this.selfLiquidateApproveEstimateGas.bind(this),
            selfLiquidate: this.selfLiquidateEstimateGas.bind(this),
        }
        this.stats = {
            parameters: this.statsParameters.bind(this),
            rates: this.statsRates.bind(this),
            futureRates: this.statsFutureRates.bind(this),
            balances: this.statsBalances.bind(this),
            bandsInfo: this.statsBandsInfo.bind(this),
            bandBalances: this.statsBandBalances.bind(this),
            bandsBalances: this.statsBandsBalances.bind(this),
            totalBorrowed: this.statsTotalBorrowed.bind(this),
            totalDebt: this.statsTotalDebt.bind(this),
            ammBalances: this.statsAmmBalances.bind(this),
            capAndAvailable: this.statsCapAndAvailable.bind(this),
        }
        this.wallet = {
            balances: this.walletBalances.bind(this),
        }
        this.vault = {
            maxDeposit: this.vaultMaxDeposit.bind(this),
            previewDeposit: this.vaultPreviewDeposit.bind(this),
            depositIsApproved: this.vaultDepositIsApproved.bind(this),
            depositApprove: this.vaultDepositApprove.bind(this),
            deposit: this.vaultDeposit.bind(this),
            maxMint: this.vaultMaxMint.bind(this),
            previewMint: this.vaultPreviewMint.bind(this),
            mintIsApproved: this.vaultMintIsApproved.bind(this),
            mintApprove: this.vaultMintApprove.bind(this),
            mint: this.vaultMint.bind(this),
            maxWithdraw: this.vaultMaxWithdraw.bind(this),
            previewWithdraw: this.vaultPreviewWithdraw.bind(this),
            withdraw: this.vaultWithdraw.bind(this),
            maxRedeem: this.vaultMaxRedeem.bind(this),
            previewRedeem: this.vaultPreviewRedeem.bind(this),
            redeem: this.vaultRedeem.bind(this),
            convertToShares: this.vaultConvertToShares.bind(this),
            convertToAssets: this.vaultConvertToAssets.bind(this),
            stakeIsApproved: this.vaultStakeIsApproved.bind(this),
            stakeApprove: this.vaultStakeApprove.bind(this),
            stake: this.vaultStake.bind(this),
            unstake: this.vaultUnstake.bind(this),
            rewardsOnly: this.vaultRewardsOnly.bind(this),
            totalLiquidity: this.vaultTotalLiquidity.bind(this),
            crvApr: this.vaultCrvApr.bind(this),
            claimableCrv: this.vaultClaimableCrv.bind(this),
            claimCrv: this.vaultClaimCrv.bind(this),
            rewardTokens: this.vaultRewardTokens.bind(this),
            rewardsApr: this.vaultRewardsApr.bind(this),
            claimableRewards: this.vaultClaimableRewards.bind(this),
            claimRewards: this.vaultClaimRewards.bind(this),
            estimateGas: {
                depositApprove: this.vaultDepositApproveEstimateGas.bind(this),
                deposit: this.vaultDepositEstimateGas.bind(this),
                mintApprove: this.vaultMintApproveEstimateGas.bind(this),
                mint: this.vaultMintEstimateGas.bind(this),
                withdraw: this.vaultWithdrawEstimateGas.bind(this),
                redeem: this.vaultRedeemEstimateGas.bind(this),
                stakeApprove: this.vaultStakeApproveEstimateGas.bind(this),
                stake: this.vaultStakeEstimateGas.bind(this),
                unstake: this.vaultUnstakeEstimateGas.bind(this),
                claimCrv: this.vaultClaimCrvEstimateGas.bind(this),
                claimRewards: this.vaultClaimRewardsEstimateGas.bind(this),
            },
        }

    }

    // ---------------- VAULT ----------------

    private async vaultMaxDeposit(address = ""): Promise<string> {
        address = _getAddress(address);
        // const _amount = await lending.contracts[this.addresses.vault].contract.maxDeposit(address);  TODO use maxDeposit
        const _amount = await lending.contracts[this.addresses.borrowed_token].contract.balanceOf(address);

        return formatUnits(_amount,  this.borrowed_token.decimals);
    }

    private async vaultPreviewDeposit(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, this.borrowed_token.decimals);
        const _shares = await lending.contracts[this.addresses.vault].contract.previewDeposit(_amount);

        return formatUnits(_shares, 18);
    }

    private async vaultDepositIsApproved(borrowed: TAmount): Promise<boolean> {
        return await hasAllowance([this.borrowed_token.address], [borrowed], lending.signerAddress, this.addresses.vault);
    }

    private async vaultDepositApproveEstimateGas (borrowed: TAmount): Promise<TGas> {
        return await ensureAllowanceEstimateGas([this.borrowed_token.address], [borrowed], this.addresses.vault);
    }

    private async vaultDepositApprove(borrowed: TAmount): Promise<string[]> {
        return await ensureAllowance([this.borrowed_token.address], [borrowed], this.addresses.vault);
    }

    private async _vaultDeposit(amount: TAmount, estimateGas = false): Promise<string | TGas> {
        const _amount = parseUnits(amount, this.borrowed_token.decimals);
        const gas = await lending.contracts[this.addresses.vault].contract.deposit.estimateGas(_amount, { ...lending.constantOptions });
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();

        const gasLimit = _mulBy1_3(DIGas(gas));

        return (await lending.contracts[this.addresses.vault].contract.deposit(_amount, { ...lending.options, gasLimit })).hash;
    }

    private async vaultDepositEstimateGas(amount: TAmount): Promise<TGas> {
        if (!(await this.vaultDepositIsApproved(amount))) throw Error("Approval is needed for gas estimation");
        return await this._vaultDeposit(amount, true) as number;
    }

    private async vaultDeposit(amount: TAmount): Promise<string> {
        await this.vaultDepositApprove(amount);
        return await this._vaultDeposit(amount, false) as string;
    }


    private async vaultMaxMint(address = ""): Promise<string> {
        address = _getAddress(address);
        // const _shares = await lending.contracts[this.addresses.vault].contract.maxMint(address);  TODO use maxMint
        const _assetBalance = await lending.contracts[this.addresses.borrowed_token].contract.balanceOf(address);
        const _shares = await lending.contracts[this.addresses.vault].contract.convertToShares(_assetBalance);

        return formatUnits(_shares, 18);
    }

    private async vaultPreviewMint(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, 18);
        const _assets = await lending.contracts[this.addresses.vault].contract.previewMint(_amount);

        return formatUnits(_assets, this.borrowed_token.decimals);
    }

    private async vaultMintIsApproved(borrowed: TAmount): Promise<boolean> {
        return await hasAllowance([this.borrowed_token.address], [borrowed], lending.signerAddress, this.addresses.vault);
    }

    private async vaultMintApproveEstimateGas (borrowed: TAmount): Promise<TGas> {
        return await ensureAllowanceEstimateGas([this.borrowed_token.address], [borrowed], this.addresses.vault);
    }

    private async vaultMintApprove(borrowed: TAmount): Promise<string[]> {
        return await ensureAllowance([this.borrowed_token.address], [borrowed], this.addresses.vault);
    }

    private async _vaultMint(amount: TAmount, estimateGas = false): Promise<string | TGas> {
        const _amount = parseUnits(amount, 18);
        const gas = await lending.contracts[this.addresses.vault].contract.mint.estimateGas(_amount, { ...lending.constantOptions });
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();

        const gasLimit = _mulBy1_3(DIGas(gas));

        return (await lending.contracts[this.addresses.vault].contract.mint(_amount, { ...lending.options, gasLimit })).hash;
    }

    private async vaultMintEstimateGas(amount: TAmount): Promise<TGas> {
        if (!(await this.vaultMintIsApproved(amount))) throw Error("Approval is needed for gas estimation");
        return await this._vaultMint(amount, true) as number;
    }

    private async vaultMint(amount: TAmount): Promise<string> {
        await this.vaultMintApprove(amount);
        return await this._vaultMint(amount, false) as string;
    }


    private async vaultMaxWithdraw(address = ""): Promise<string> {
        address = _getAddress(address);
        const _assets = await lending.contracts[this.addresses.vault].contract.maxWithdraw(address);

        return formatUnits(_assets, this.borrowed_token.decimals);
    }

    private async vaultPreviewWithdraw(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, this.borrowed_token.decimals);
        const _shares = await lending.contracts[this.addresses.vault].contract.previewWithdraw(_amount);

        return formatUnits(_shares, 18);
    }

    private async _vaultWithdraw(amount: TAmount, estimateGas = false): Promise<string | TGas> {
        const _amount = parseUnits(amount, this.borrowed_token.decimals);
        const gas = await lending.contracts[this.addresses.vault].contract.withdraw.estimateGas(_amount, { ...lending.constantOptions });
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();

        const gasLimit = _mulBy1_3(DIGas(gas));

        return (await lending.contracts[this.addresses.vault].contract.withdraw(_amount, { ...lending.options, gasLimit })).hash;
    }

    private async vaultWithdrawEstimateGas(amount: TAmount): Promise<TGas> {
        return await this._vaultWithdraw(amount, true) as number;
    }

    private async vaultWithdraw(amount: TAmount): Promise<string> {
        return await this._vaultWithdraw(amount, false) as string;
    }


    private async vaultMaxRedeem(address = ""): Promise<string> {
        address = _getAddress(address);
        const _shares = await lending.contracts[this.addresses.vault].contract.maxRedeem(address)

        return formatUnits(_shares, 18);
    }

    private async vaultPreviewRedeem(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, 18);
        const _assets = await lending.contracts[this.addresses.vault].contract.previewRedeem(_amount);

        return formatUnits(_assets, this.borrowed_token.decimals);
    }

    private async _vaultRedeem(amount: TAmount, estimateGas = false): Promise<string | TGas> {
        const _amount = parseUnits(amount, 18);
        const gas = await lending.contracts[this.addresses.vault].contract.redeem.estimateGas(_amount, { ...lending.constantOptions });
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();

        const gasLimit = _mulBy1_3(DIGas(gas));

        return (await lending.contracts[this.addresses.vault].contract.redeem(_amount, { ...lending.options, gasLimit })).hash;
    }

    private async vaultRedeemEstimateGas(amount: TAmount): Promise<TGas> {
        return await this._vaultRedeem(amount, true) as number;
    }

    private async vaultRedeem(amount: TAmount): Promise<string> {
        return await this._vaultRedeem(amount, false) as string;
    }

    // ---------------- VAULT UTILS ----------------

    private async vaultConvertToShares(assets: TAmount): Promise<string> {
        const _assets = parseUnits(assets, this.borrowed_token.decimals);
        const _shares = await lending.contracts[this.addresses.vault].contract.convertToShares(_assets);

        return lending.formatUnits(_shares);
    }

    private async vaultConvertToAssets(shares: TAmount): Promise<string> {
        const _shares = parseUnits(shares);
        const _assets = await lending.contracts[this.addresses.vault].contract.convertToAssets(_shares);

        return lending.formatUnits(_assets, this.borrowed_token.decimals);
    }

    // ---------------- VAULT STAKING ----------------

    private async vaultStakeIsApproved(vaultShares: number | string): Promise<boolean> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            throw Error(`stakeIsApproved method doesn't exist for pool ${this.name} (id: ${this.name}). There is no gauge`);
        }
        return await hasAllowance([this.addresses.vault], [vaultShares], lending.signerAddress, this.addresses.gauge);
    }

    private async vaultStakeApproveEstimateGas(vaultShares: number | string): Promise<TGas> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            throw Error(`stakeApproveEstimateGas method doesn't exist for pool ${this.name} (id: ${this.name}). There is no gauge`);
        }
        return await ensureAllowanceEstimateGas([this.addresses.vault], [vaultShares], this.addresses.gauge);
    }

    private async vaultStakeApprove(vaultShares: number | string): Promise<string[]> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            throw Error(`stakeApprove method doesn't exist for pool ${this.name} (id: ${this.name}). There is no gauge`);
        }
        return await ensureAllowance([this.addresses.vault], [vaultShares], this.addresses.gauge);
    }

    private async vaultStakeEstimateGas(vaultShares: number | string): Promise<TGas> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            throw Error(`stakeEstimateGas method doesn't exist for pool ${this.name} (id: ${this.name}). There is no gauge`);
        }
        const _vaultShares = parseUnits(vaultShares);
        return smartNumber(await lending.contracts[this.addresses.gauge].contract.deposit.estimateGas(_vaultShares, lending.constantOptions));
    }

    private async vaultStake(vaultShares: number | string): Promise<string> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            throw Error(`stake method doesn't exist for pool ${this.name} (id: ${this.name}). There is no gauge`);
        }
        const _vaultShares = parseUnits(vaultShares);
        await _ensureAllowance([this.addresses.vault], [_vaultShares], this.addresses.gauge)

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(await lending.contracts[this.addresses.gauge].contract.deposit.estimateGas(_vaultShares, lending.constantOptions)));
        return (await lending.contracts[this.addresses.gauge].contract.deposit(_vaultShares, { ...lending.options, gasLimit })).hash;
    }

    private async vaultUnstakeEstimateGas(vaultShares: number | string): Promise<TGas> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            throw Error(`unstakeEstimateGas method doesn't exist for pool ${this.name} (id: ${this.name}). There is no gauge`);
        }
        const _vaultShares = parseUnits(vaultShares);
        return smartNumber(await lending.contracts[this.addresses.gauge].contract.withdraw.estimateGas(_vaultShares, lending.constantOptions));
    }

    private async vaultUnstake(vaultShares: number | string): Promise<string> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            throw Error(`unstake method doesn't exist for pool ${this.name} (id: ${this.name}). There is no gauge`);
        }
        const _vaultShares = parseUnits(vaultShares);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas((await lending.contracts[this.addresses.gauge].contract.withdraw.estimateGas(_vaultShares, lending.constantOptions))));
        return (await lending.contracts[this.addresses.gauge].contract.withdraw(_vaultShares, { ...lending.options, gasLimit })).hash;
    }

    // ---------------- VAULT STAKING REWARDS ----------------

    private vaultRewardsOnly(): boolean {
        if (lending.chainId === 2222 || lending.chainId === 324) return true;  // TODO remove this for Kava and ZkSync
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) throw Error(`${this.name} doesn't have gauge`);
        const gaugeContract = lending.contracts[this.addresses.gauge].contract;

        return !('inflation_rate()' in gaugeContract || 'inflation_rate(uint256)' in gaugeContract);
    }

    private async vaultTotalLiquidity(): Promise<string> {
        const { cap } = await this.statsCapAndAvailable();
        const price = await _getUsdRate(this.addresses.borrowed_token);

        return BN(cap).times(price).toFixed(6)
    }

    private _calcCrvApr = async (futureWorkingSupplyBN: BigNumber | null = null): Promise<[baseApy: number, boostedApy: number]> => {
        const totalLiquidityUSD = await this.vaultTotalLiquidity();
        if (Number(totalLiquidityUSD) === 0) return [0, 0];

        let inflationRateBN, workingSupplyBN, totalSupplyBN;
        if (lending.chainId !== 1) {
            const gaugeContract = lending.contracts[this.addresses.gauge].multicallContract;
            const lpTokenContract = lending.contracts[this.addresses.vault].multicallContract;
            const crvContract = lending.contracts[lending.constants.ALIASES.crv].contract;

            const currentWeek = Math.floor(Date.now() / 1000 / WEEK);
            [inflationRateBN, workingSupplyBN, totalSupplyBN] = (await lending.multicallProvider.all([
                gaugeContract.inflation_rate(currentWeek),
                gaugeContract.working_supply(),
                lpTokenContract.totalSupply(),
            ]) as bigint[]).map((value) => toBN(value));

            if (inflationRateBN.eq(0)) {
                inflationRateBN = toBN(await crvContract.balanceOf(this.addresses.gauge, lending.constantOptions)).div(WEEK);
            }
        } else {
            const gaugeContract = lending.contracts[this.addresses.gauge].multicallContract;
            const lpTokenContract = lending.contracts[this.addresses.vault].multicallContract;
            const gaugeControllerContract = lending.contracts[lending.constants.ALIASES.gauge_controller].multicallContract;

            let weightBN;
            [inflationRateBN, weightBN, workingSupplyBN, totalSupplyBN] = (await lending.multicallProvider.all([
                gaugeContract.inflation_rate(),
                gaugeControllerContract.gauge_relative_weight(this.addresses.gauge),
                gaugeContract.working_supply(),
                lpTokenContract.totalSupply(),
            ]) as bigint[]).map((value) => toBN(value));

            inflationRateBN = inflationRateBN.times(weightBN);
        }

        if (inflationRateBN.eq(0)) return [0, 0];
        if (futureWorkingSupplyBN !== null) workingSupplyBN = futureWorkingSupplyBN;

        // If you added 1$ value of LP it would be 0.4$ of working LP. So your annual reward per 1$ in USD is:
        // (annual reward per working liquidity in $) * (0.4$ of working LP)
        const rateBN = inflationRateBN.times(31536000).div(workingSupplyBN).times(totalSupplyBN).div(Number(totalLiquidityUSD)).times(0.4);
        const crvPrice = await _getUsdRate(lending.constants.ALIASES.crv);
        const baseApyBN = rateBN.times(crvPrice);
        const boostedApyBN = baseApyBN.times(2.5);

        return [baseApyBN.times(100).toNumber(), boostedApyBN.times(100).toNumber()]
    }

    private async vaultCrvApr(useApi = true): Promise<[baseApy: number, boostedApy: number]> {
        if (this.vaultRewardsOnly()) throw Error(`${this.name} has Rewards-Only Gauge. Use stats.rewardsApy instead`);

        // const isDisabledChain = [1313161554].includes(lending.chainId); // Disable Aurora
        // if (useApi && !isDisabledChain) {
        //     const crvAPYs = await _getCrvApyFromApi();
        //     const poolCrvApy = crvAPYs[this.addresses.gauge] ?? [0, 0];  // new pools might be missing
        //     return [poolCrvApy[0], poolCrvApy[1]];
        // }

        return await this._calcCrvApr();
    }

    private async vaultClaimableCrv (address = ""): Promise<string> {
        if (this.vaultRewardsOnly()) throw Error(`${this.name} has Rewards-Only Gauge. Use claimableRewards instead`);
        address = address || lending.signerAddress;
        if (!address) throw Error("Need to connect wallet or pass address into args");

        return lending.formatUnits(await lending.contracts[this.addresses.gauge].contract.claimable_tokens(address, lending.constantOptions));
    }

    private async _vaultClaimCrv(estimateGas: boolean): Promise<string | TGas> {
        if (this.vaultRewardsOnly()) throw Error(`${this.name} has Rewards-Only Gauge. Use claimRewards instead`);
        const contract = lending.contracts[lending.constants.ALIASES.minter].contract;
        const gas = await contract.mint.estimateGas(this.addresses.gauge, lending.constantOptions);
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(gas));
        return (await contract.mint(this.addresses.gauge, { ...lending.options, gasLimit })).hash
    }

    private async vaultClaimCrvEstimateGas(): Promise<TGas> {
        return await this._vaultClaimCrv(true) as TGas;
    }

    private async vaultClaimCrv(): Promise<string> {
        return await this._vaultClaimCrv(false) as string;
    }

    private vaultRewardTokens = memoize(async (useApi = true): Promise<{token: string, symbol: string, decimals: number}[]> => {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) return []

        // if (useApi) {
        //     const rewards = await _getRewardsFromApi();
        //     if (!rewards[this.addresses.gauge]) return [];
        //     rewards[this.addresses.gauge].forEach((r) => _setContracts(r.tokenAddress, ERC20Abi));
        //     return rewards[this.addresses.gauge].map((r) => ({ token: r.tokenAddress, symbol: r.symbol, decimals: Number(r.decimals) }));
        // }

        const gaugeContract = lending.contracts[this.addresses.gauge].contract;
        const gaugeMulticallContract = lending.contracts[this.addresses.gauge].multicallContract;
        const rewardCount = Number(lending.formatUnits(await gaugeContract.reward_count(lending.constantOptions), 0));

        const tokenCalls = [];
        for (let i = 0; i < rewardCount; i++) {
            tokenCalls.push(gaugeMulticallContract.reward_tokens(i));
        }
        const tokens = (await lending.multicallProvider.all(tokenCalls) as string[])
            .filter((addr) => addr !== lending.constants.ZERO_ADDRESS)
            .map((addr) => addr.toLowerCase())
            .filter((addr) => lending.chainId === 1 || addr !== lending.constants.COINS.crv);

        const tokenInfoCalls = [];
        for (const token of tokens) {
            lending.setContract(token, ERC20Abi);
            const tokenMulticallContract = lending.contracts[token].multicallContract;
            tokenInfoCalls.push(tokenMulticallContract.symbol(), tokenMulticallContract.decimals());
        }
        const tokenInfo = await lending.multicallProvider.all(tokenInfoCalls);
        for (let i = 0; i < tokens.length; i++) {
            lending.constants.DECIMALS[tokens[i]] = tokenInfo[(i * 2) + 1] as number;
        }

        return tokens.map((token, i) => ({ token, symbol: tokenInfo[i * 2] as string, decimals: tokenInfo[(i * 2) + 1] as number }));
    },
    {
        promise: true,
        maxAge: 30 * 60 * 1000, // 30m
    });

    private vaultRewardsApr = async (useApi = true): Promise<IReward[]> => {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) return [];

        // const isDisabledChain = [1313161554].includes(lending.chainId); // Disable Aurora
        // if (useApi && !isDisabledChain) {
        //     const rewards = await _getRewardsFromApi();
        //     if (!rewards[this.addresses.gauge]) return [];
        //     return rewards[this.addresses.gauge].map((r) => ({ gaugeAddress: r.gaugeAddress, tokenAddress: r.tokenAddress, symbol: r.symbol, apy: r.apy }));
        // }

        const apy: IReward[] = [];
        const rewardTokens = await this.vaultRewardTokens(false);
        for (const rewardToken of rewardTokens) {
            const gaugeContract = lending.contracts[this.addresses.gauge].multicallContract;
            const lpTokenContract = lending.contracts[this.addresses.vault].multicallContract;
            const rewardContract = lending.contracts[this.addresses.gauge].multicallContract;

            const totalLiquidityUSD = await this.vaultTotalLiquidity();
            const rewardRate = await _getUsdRate(rewardToken.token);

            const [rewardData, _stakedSupply, _totalSupply] = (await lending.multicallProvider.all([
                rewardContract.reward_data(rewardToken.token),
                gaugeContract.totalSupply(),
                lpTokenContract.totalSupply(),
            ]) as any[]);
            const stakedSupplyBN = toBN(_stakedSupply as bigint);
            const totalSupplyBN = toBN(_totalSupply as bigint);
            const inflationBN = toBN(rewardData.rate, rewardToken.decimals);
            const periodFinish = Number(lending.formatUnits(rewardData.period_finish, 0)) * 1000;
            const baseApy = periodFinish > Date.now() ?
                inflationBN.times(31536000).times(rewardRate).div(stakedSupplyBN).times(totalSupplyBN).div(Number(totalLiquidityUSD)) :
                BN(0);

            apy.push({
                gaugeAddress: this.addresses.gauge,
                tokenAddress: rewardToken.token,
                symbol: rewardToken.symbol,
                apy: baseApy.times(100).toNumber(),
            });
        }

        return apy
    }

    private async vaultClaimableRewards(address = ""): Promise<{token: string, symbol: string, amount: string}[]> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            throw Error(`claimableRewards method doesn't exist for pool ${this.name} (id: ${this.name}). There is no gauge`);
        }
        address = address || lending.signerAddress;
        if (!address) throw Error("Need to connect wallet or pass address into args");

        const gaugeContract = lending.contracts[this.addresses.gauge].contract;
        const rewardTokens = await this.vaultRewardTokens();
        const rewards = [];
        for (const rewardToken of rewardTokens) {
            const _amount = await gaugeContract.claimable_reward(address, rewardToken.token, lending.constantOptions);
            rewards.push({
                token: rewardToken.token,
                symbol: rewardToken.symbol,
                amount: lending.formatUnits(_amount, rewardToken.decimals),
            });
        }

        return rewards
    }

    private async _vaultClaimRewards(estimateGas: boolean): Promise<string | TGas> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            throw Error(`claimRewards method doesn't exist for pool ${this.name} (id: ${this.name}). There is no gauge`);
        }
        const gaugeContract = lending.contracts[this.addresses.gauge].contract;
        if (!("claim_rewards()" in gaugeContract)) throw Error (`${this.name} pool doesn't have such method`);
        const gas = await gaugeContract.claim_rewards.estimateGas(lending.constantOptions);
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(gas));
        return (await gaugeContract.claim_rewards({ ...lending.options, gasLimit })).hash;
    }

    private async vaultClaimRewardsEstimateGas(): Promise<TGas> {
        return await this._vaultClaimRewards(true) as TGas;
    }

    private async vaultClaimRewards(): Promise<string> {
        return await this._vaultClaimRewards(false) as string;
    }

    // ---------------- STATS ----------------

    private statsParameters = memoize(async (): Promise<{
            fee: string, // %
            admin_fee: string, // %
            liquidation_discount: string, // %
            loan_discount: string, // %
            base_price: string,
            A: string,
        }> => {
        const llammaContract = lending.contracts[this.addresses.amm].multicallContract;
        const controllerContract = lending.contracts[this.addresses.controller].multicallContract;

        const calls = [
            llammaContract.fee(),
            llammaContract.admin_fee(),
            controllerContract.liquidation_discount(),
            controllerContract.loan_discount(),
            llammaContract.get_base_price(),
            llammaContract.A(),
        ]

        const [_fee, _admin_fee, _liquidation_discount, _loan_discount, _base_price, _A]: bigint[] = await lending.multicallProvider.all(calls) as bigint[];
        const A = formatUnits(_A, 0)
        const base_price = formatUnits(_base_price)
        const [fee, admin_fee, liquidation_discount, loan_discount] = [_fee, _admin_fee, _liquidation_discount, _loan_discount]
            .map((_x) => formatUnits(_x * BigInt(100)));

        return { fee, admin_fee, liquidation_discount, loan_discount, base_price, A }
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

    private _getRate = memoize(async (): Promise<bigint> => {
        const llammaContract = lending.contracts[this.addresses.amm].contract;
        return await llammaContract.rate();
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

    private _getFutureRate = memoize(async (_dReserves: bigint, _dDebt: bigint): Promise<bigint> => {
        const mpContract = lending.contracts[this.addresses.monetary_policy].contract;
        return await mpContract.future_rate(this.addresses.controller, _dReserves, _dDebt);
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

    private async statsRates(): Promise<{borrowApr: string, lendApr: string, borrowApy: string, lendApy: string}> {
        const _rate = await this._getRate();
        const borrowApr =  toBN(_rate).times(365).times(86400).times(100).toString();
        // borrowApy = e**(rate*365*86400) - 1
        const borrowApy = String(((2.718281828459 ** (toBN(_rate).times(365).times(86400)).toNumber()) - 1) * 100);
        let lendApr = "0";
        let lendApy = "0";
        const debt = await this.statsTotalDebt();
        if (Number(debt) > 0) {
            const { cap } = await this.statsCapAndAvailable();
            lendApr = toBN(_rate).times(365).times(86400).times(debt).div(cap).times(100).toString();
            // lendApy = (debt * e**(rate*365*86400) - debt) / cap
            const debtInAYearBN = BN(debt).times(2.718281828459 ** (toBN(_rate).times(365).times(86400)).toNumber());
            lendApy = debtInAYearBN.minus(debt).div(cap).times(100).toString();
        }

        return { borrowApr, lendApr, borrowApy, lendApy }
    }

    private async statsFutureRates(dReserves: TAmount, dDebt: TAmount): Promise<{borrowApr: string, lendApr: string, borrowApy: string, lendApy: string}> {
        const _dReserves = parseUnits(dReserves, this.borrowed_token.decimals);
        const _dDebt = parseUnits(dDebt, this.borrowed_token.decimals);
        const _rate = await this._getFutureRate(_dReserves, _dDebt);
        const borrowApr =  toBN(_rate).times(365).times(86400).times(100).toString();
        // borrowApy = e**(rate*365*86400) - 1
        const borrowApy = String(((2.718281828459 ** (toBN(_rate).times(365).times(86400)).toNumber()) - 1) * 100);
        let lendApr = "0";
        let lendApy = "0";
        const debt = Number(await this.statsTotalDebt()) + Number(dDebt);
        if (Number(debt) > 0) {
            const cap = Number((await this.statsCapAndAvailable()).cap) + Number(dReserves);
            lendApr = toBN(_rate).times(365).times(86400).times(debt).div(cap).times(100).toString();
            // lendApy = (debt * e**(rate*365*86400) - debt) / cap
            const debtInAYearBN = BN(debt).times(2.718281828459 ** (toBN(_rate).times(365).times(86400)).toNumber());
            lendApy = debtInAYearBN.minus(debt).div(cap).times(100).toString();
        }

        return { borrowApr, lendApr, borrowApy, lendApy }
    }

    private async statsBalances(): Promise<[string, string]> {
        const borrowedContract = lending.contracts[this.borrowed_token.address].multicallContract;
        const collateralContract = lending.contracts[this.collateral_token.address].multicallContract;
        const ammContract = lending.contracts[this.addresses.amm].multicallContract;
        const calls = [
            borrowedContract.balanceOf(this.addresses.amm),
            collateralContract.balanceOf(this.addresses.amm),
            ammContract.admin_fees_x(),
            ammContract.admin_fees_y(),
        ]
        const [_borrowedBalance, _collateralBalance, _borrowedAdminFees, _collateralAdminFees]: bigint[] = await lending.multicallProvider.all(calls);

        return [
            formatUnits(_borrowedBalance - _borrowedAdminFees, this.borrowed_token.decimals),
            formatUnits(_collateralBalance - _collateralAdminFees, this.collateral_token.decimals),
        ];
    }

    private statsBandsInfo = memoize(async (): Promise<{ activeBand: number, maxBand: number, minBand: number, liquidationBand: number | null }> => {
        const ammContract = lending.contracts[this.addresses.amm].multicallContract;
        const calls = [
            ammContract.active_band(),
            ammContract.max_band(),
            ammContract.min_band(),
        ]

        const [activeBand, maxBand, minBand] = (await lending.multicallProvider.all(calls) as bigint[]).map((_b) => Number(_b));
        const { borrowed, collateral } = await this.statsBandBalances(activeBand);
        let liquidationBand = null;
        if (Number(borrowed) > 0 && Number(collateral) > 0) liquidationBand = activeBand;
        return { activeBand, maxBand, minBand, liquidationBand }
    },
    {
        promise: true,
        maxAge: 60 * 1000, // 1m
    });

    private async statsBandBalances(n: number): Promise<{ borrowed: string, collateral: string }> {
        const ammContract = lending.contracts[this.addresses.amm].multicallContract;
        const calls = [];
        calls.push(ammContract.bands_x(n), ammContract.bands_y(n));
        const _balances: bigint[] = await lending.multicallProvider.all(calls);

        // bands_x and bands_y always return amounts with 18 decimals
        return {
            borrowed: formatNumber(formatUnits(_balances[0]), this.borrowed_token.decimals),
            collateral: formatNumber(formatUnits(_balances[1]), this.collateral_token.decimals),
        }
    }

    private async statsBandsBalances(): Promise<{ [index: number]: { borrowed: string, collateral: string } }> {
        const { maxBand, minBand } = await this.statsBandsInfo();

        const ammContract = lending.contracts[this.addresses.amm].multicallContract;
        const calls = [];
        for (let i = minBand; i <= maxBand; i++) {
            calls.push(ammContract.bands_x(i), ammContract.bands_y(i));
        }

        const _bands: bigint[] = await lending.multicallProvider.all(calls);

        const bands: { [index: number]: { borrowed: string, collateral: string } } = {};
        for (let i = minBand; i <= maxBand; i++) {
            const _i = i - minBand
            // bands_x and bands_y always return amounts with 18 decimals
            bands[i] = {
                borrowed: formatNumber(formatUnits(_bands[2 * _i]), this.borrowed_token.decimals),
                collateral: formatNumber(formatUnits(_bands[(2 * _i) + 1]), this.collateral_token.decimals),
            }
        }

        return bands
    }

    private statsTotalBorrowed = memoize(async (): Promise<string> => {
        const controllerContract = lending.contracts[this.addresses.controller].multicallContract;
        const calls = [controllerContract.minted(), controllerContract.redeemed()]
        const [_minted, _redeemed]: bigint[] = await lending.multicallProvider.all(calls);

        return toBN(_minted, this.borrowed_token.decimals).minus(toBN(_redeemed, this.borrowed_token.decimals)).toString();
    },
    {
        promise: true,
        maxAge: 60 * 1000, // 1m
    });

    private statsTotalDebt = memoize(async (): Promise<string> => {
        const debt = await lending.contracts[this.addresses.controller].contract.total_debt(lending.constantOptions);
        return formatUnits(debt, this.borrowed_token.decimals);
    },
    {
        promise: true,
        maxAge: 60 * 1000, // 1m
    });

    private statsAmmBalances = memoize(async (): Promise<{ borrowed: string, collateral: string }> => {
        const borrowedContract = lending.contracts[this.addresses.borrowed_token].multicallContract;
        const collateralContract = lending.contracts[this.addresses.collateral_token].multicallContract;
        const ammContract = lending.contracts[this.addresses.amm].multicallContract;

        const [_balance_x, _fee_x, _balance_y, _fee_y]: bigint[] = await lending.multicallProvider.all([
            borrowedContract.balanceOf(this.addresses.amm),
            ammContract.admin_fees_x(),
            collateralContract.balanceOf(this.addresses.amm),
            ammContract.admin_fees_y(),
        ]);

        return {
            borrowed: toBN(_balance_x, this.borrowed_token.decimals).minus(toBN(_fee_x, this.borrowed_token.decimals)).toString(),
            collateral: toBN(_balance_y, this.collateral_token.decimals).minus(toBN(_fee_y, this.collateral_token.decimals)).toString(),
        }
    },
    {
        promise: true,
        maxAge: 60 * 1000, // 1m
    });

    private statsCapAndAvailable = memoize(async (): Promise<{ cap: string, available: string }> => {
        const vaultContract = lending.contracts[this.addresses.vault].multicallContract;
        const borrowedContract = lending.contracts[this.addresses.borrowed_token].multicallContract;

        const [_cap, _available]: bigint[] = await lending.multicallProvider.all([
            vaultContract.totalAssets(this.addresses.controller),
            borrowedContract.balanceOf(this.addresses.controller),
        ]);

        return {
            cap: lending.formatUnits(_cap, this.borrowed_token.decimals),
            available: lending.formatUnits(_available, this.borrowed_token.decimals),
        }
    },
    {
        promise: true,
        maxAge: 60 * 1000, // 1m
    });

    // ---------------- PRICES ----------------

    public A = memoize(async(): Promise<string> => {
        const _A = await lending.contracts[this.addresses.amm].contract.A(lending.constantOptions) as bigint;
        return formatUnits(_A, 0);
    },
    {
        promise: true,
        maxAge: 86400 * 1000, // 1d
    });

    public basePrice = memoize(async(): Promise<string> => {
        const _price = await lending.contracts[this.addresses.amm].contract.get_base_price(lending.constantOptions) as bigint;
        return formatUnits(_price);
    },
    {
        promise: true,
        maxAge: 86400 * 1000, // 1d
    });

    public async oraclePrice(): Promise<string> {
        const _price = await lending.contracts[this.addresses.amm].contract.price_oracle(lending.constantOptions) as bigint;
        return formatUnits(_price);
    }

    public async oraclePriceBand(): Promise<number> {
        const oraclePriceBN = BN(await this.oraclePrice());
        const basePriceBN = BN(await this.basePrice());
        const A_BN = BN(await this.A());
        const multiplier = oraclePriceBN.lte(basePriceBN) ? A_BN.minus(1).div(A_BN) : A_BN.div(A_BN.minus(1));
        const term = oraclePriceBN.lte(basePriceBN) ? 1 : -1;
        const compareFunc = oraclePriceBN.lte(basePriceBN) ?
            (oraclePriceBN: BigNumber, currentTickPriceBN: BigNumber) => oraclePriceBN.lte(currentTickPriceBN) :
            (oraclePriceBN: BigNumber, currentTickPriceBN: BigNumber) => oraclePriceBN.gt(currentTickPriceBN);

        let band = 0;
        let currentTickPriceBN = oraclePriceBN.lte(basePriceBN) ? basePriceBN.times(multiplier) : basePriceBN;
        while (compareFunc(oraclePriceBN, currentTickPriceBN)) {
            currentTickPriceBN = currentTickPriceBN.times(multiplier);
            band += term;
        }

        return band;
    }

    public async price(): Promise<string> {
        const _price = await lending.contracts[this.addresses.amm].contract.get_p(lending.constantOptions) as bigint;
        return formatUnits(_price);
    }

    public async calcTickPrice(n: number): Promise<string> {
        const basePrice = await this.basePrice();
        const basePriceBN = BN(basePrice);
        const A_BN = BN(await this.A());

        return _cutZeros(basePriceBN.times(A_BN.minus(1).div(A_BN).pow(n)).toFixed(18))
    }

    public async calcBandPrices(n: number): Promise<[string, string]> {
        return [await this.calcTickPrice(n + 1), await this.calcTickPrice(n)]
    }

    public async calcRangePct(range: number): Promise<string> {
        const A_BN = BN(await this.A());
        const startBN = BN(1);
        const endBN = A_BN.minus(1).div(A_BN).pow(range);

        return startBN.minus(endBN).times(100).toFixed(6)
    }

    // ---------------- WALLET BALANCES ----------------

    private async walletBalances(address = ""): Promise<{ collateral: string, borrowed: string, vaultShares: string, gauge: string }> {
        if (this.addresses.gauge === lending.constants.ZERO_ADDRESS) {
            const [collateral, borrowed, vaultShares] =
                await getBalances([this.collateral_token.address, this.borrowed_token.address, this.addresses.vault], address);
            return { collateral, borrowed, vaultShares, gauge: "0" }
        } else {
            const [collateral, borrowed, vaultShares, gauge] =
                await getBalances([this.collateral_token.address, this.borrowed_token.address, this.addresses.vault, this.addresses.gauge], address);
            return { collateral, borrowed, vaultShares, gauge }
        }
    }

    // ---------------- USER POSITION ----------------

    public async userLoanExists(address = ""): Promise<boolean> {
        address = _getAddress(address);
        return  await lending.contracts[this.addresses.controller].contract.loan_exists(address, lending.constantOptions);
    }

    public async _userState(address = ""): Promise<{ _collateral: bigint, _borrowed: bigint, _debt: bigint, _N: bigint }> {
        address = _getAddress(address);
        const contract = lending.contracts[this.addresses.controller].contract;
        const [_collateral, _borrowed, _debt, _N] = await contract.user_state(address, lending.constantOptions) as bigint[];

        return { _collateral, _borrowed, _debt, _N }
    }

    public async userState(address = ""): Promise<{ collateral: string, borrowed: string, debt: string, N: string }> {
        const { _collateral, _borrowed, _debt, _N } = await this._userState(address);

        return {
            collateral: formatUnits(_collateral, this.collateral_token.decimals),
            borrowed: formatUnits(_borrowed, this.borrowed_token.decimals),
            debt: formatUnits(_debt, this.borrowed_token.decimals),
            N: formatUnits(_N, 0),
        };
    }

    public async userHealth(full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        let _health = await lending.contracts[this.addresses.controller].contract.health(address, full, lending.constantOptions) as bigint;
        _health = _health * BigInt(100);

        return formatUnits(_health);
    }

    public async userBands(address = ""): Promise<number[]> {
        address = _getAddress(address);
        const _bands = await lending.contracts[this.addresses.amm].contract.read_user_tick_numbers(address, lending.constantOptions) as bigint[];

        return _bands.map((_t) => Number(_t)).reverse();
    }

    public async userRange(address = ""): Promise<number> {
        const [n2, n1] = await this.userBands(address);
        if (n1 == n2) return 0;
        return n2 - n1 + 1;
    }

    public async userPrices(address = ""): Promise<string[]> {
        address = _getAddress(address);
        const _prices = await lending.contracts[this.addresses.controller].contract.user_prices(address, lending.constantOptions) as bigint[];

        return _prices.map((_p) => formatUnits(_p)).reverse();
    }

    public async userBandsBalances(address = ""): Promise<IDict<{ collateral: string, borrowed: string }>> {
        const [n2, n1] = await this.userBands(address);
        if (n1 == 0 && n2 == 0) return {};

        address = _getAddress(address);
        const contract = lending.contracts[this.addresses.amm].contract;
        const [_borrowed, _collateral] = await contract.get_xy(address, lending.constantOptions) as [bigint[], bigint[]];

        const res: IDict<{ borrowed: string, collateral: string }> = {};
        for (let i = n1; i <= n2; i++) {
            res[i] = {
                collateral: formatUnits(_collateral[i - n1], this.collateral_token.decimals),
                borrowed: formatUnits(_borrowed[i - n1], this.borrowed_token.decimals),
            };
        }

        return res
    }

    // ---------------- CREATE LOAN ----------------

    private _checkRange(range: number): void {
        if (range < this.minBands) throw Error(`range must be >= ${this.minBands}`);
        if (range > this.maxBands) throw Error(`range must be <= ${this.maxBands}`);
    }

    public async createLoanMaxRecv(collateral: number | string, range: number): Promise<string> {
        this._checkRange(range);
        const _collateral = parseUnits(collateral, this.collateral_token.decimals);
        const contract = lending.contracts[this.addresses.controller].contract;

        return formatUnits(await contract.max_borrowable(_collateral, range, lending.constantOptions), this.borrowed_token.decimals);
    }

    public createLoanMaxRecvAllRanges = memoize(async (collateral: number | string): Promise<{ [index: number]: string }> => {
        const _collateral = parseUnits(collateral, this.collateral_token.decimals);

        const calls = [];
        for (let N = this.minBands; N <= this.maxBands; N++) {
            calls.push(lending.contracts[this.addresses.controller].multicallContract.max_borrowable(_collateral, N));
        }
        const _amounts = await lending.multicallProvider.all(calls) as bigint[];

        const res: { [index: number]: string } = {};
        for (let N = this.minBands; N <= this.maxBands; N++) {
            res[N] = formatUnits(_amounts[N - this.minBands], this.borrowed_token.decimals);
        }

        return res;
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

    public async getMaxRange(collateral: number | string, debt: number | string): Promise<number> {
        const maxRecv = await this.createLoanMaxRecvAllRanges(collateral);
        for (let N = this.minBands; N <= this.maxBands; N++) {
            if (BN(debt).gt(BN(maxRecv[N]))) return N - 1;
        }

        return this.maxBands;
    }

    private async _calcN1(_collateral: bigint, _debt: bigint, range: number): Promise<bigint> {
        this._checkRange(range);
        return await lending.contracts[this.addresses.controller].contract.calculate_debt_n1(_collateral, _debt, range, lending.constantOptions);
    }

    private async _calcN1AllRanges(_collateral: bigint, _debt: bigint, maxN: number): Promise<bigint[]> {
        const calls = [];
        for (let N = this.minBands; N <= maxN; N++) {
            calls.push(lending.contracts[this.addresses.controller].multicallContract.calculate_debt_n1(_collateral, _debt, N));
        }
        return await lending.multicallProvider.all(calls) as bigint[];
    }

    private async _getPrices(_n2: bigint, _n1: bigint): Promise<string[]> {
        const contract = lending.contracts[this.addresses.amm].multicallContract;
        return (await lending.multicallProvider.all([
            contract.p_oracle_down(_n2),
            contract.p_oracle_up(_n1),
        ]) as bigint[]).map((_p) => formatUnits(_p));
    }

    private async _calcPrices(_n2: bigint, _n1: bigint): Promise<[string, string]> {
        return [await this.calcTickPrice(Number(_n2) + 1), await this.calcTickPrice(Number(_n1))];
    }

    private async _createLoanBands(collateral: number | string, debt: number | string, range: number): Promise<[bigint, bigint]> {
        const _n1 = await this._calcN1(parseUnits(collateral, this.collateral_token.decimals), parseUnits(debt, this.borrowed_token.decimals), range);
        const _n2 = _n1 + BigInt(range - 1);

        return [_n2, _n1];
    }

    private async _createLoanBandsAllRanges(collateral: number | string, debt: number | string): Promise<{ [index: number]: [bigint, bigint] }> {
        const maxN = await this.getMaxRange(collateral, debt);
        const _n1_arr = await this._calcN1AllRanges(parseUnits(collateral, this.collateral_token.decimals), parseUnits(debt, this.borrowed_token.decimals), maxN);
        const _n2_arr: bigint[] = [];
        for (let N = this.minBands; N <= maxN; N++) {
            _n2_arr.push(_n1_arr[N - this.minBands] + BigInt(N - 1));
        }

        const res: { [index: number]: [bigint, bigint] } = {};
        for (let N = this.minBands; N <= maxN; N++) {
            res[N] = [_n2_arr[N - this.minBands], _n1_arr[N - this.minBands]];
        }

        return res;
    }

    public async createLoanBands(collateral: number | string, debt: number | string, range: number): Promise<[number, number]> {
        const [_n2, _n1] = await this._createLoanBands(collateral, debt, range);

        return [Number(_n2), Number(_n1)];
    }

    public async createLoanBandsAllRanges(collateral: number | string, debt: number | string): Promise<{ [index: number]: [number, number] | null }> {
        const _bandsAllRanges = await this._createLoanBandsAllRanges(collateral, debt);

        const bandsAllRanges: { [index: number]: [number, number] | null } = {};
        for (let N = this.minBands; N <= this.maxBands; N++) {
            if (_bandsAllRanges[N]) {
                bandsAllRanges[N] = _bandsAllRanges[N].map(Number) as [number, number];
            } else {
                bandsAllRanges[N] = null
            }
        }

        return bandsAllRanges;
    }

    public async createLoanPrices(collateral: number | string, debt: number | string, range: number): Promise<string[]> {
        const [_n2, _n1] = await this._createLoanBands(collateral, debt, range);

        return await this._getPrices(_n2, _n1);
    }

    public async createLoanPricesAllRanges(collateral: number | string, debt: number | string): Promise<{ [index: number]: [string, string] | null }> {
        const _bandsAllRanges = await this._createLoanBandsAllRanges(collateral, debt);

        const pricesAllRanges: { [index: number]: [string, string] | null } = {};
        for (let N = this.minBands; N <= this.maxBands; N++) {
            if (_bandsAllRanges[N]) {
                pricesAllRanges[N] = await this._calcPrices(..._bandsAllRanges[N]);
            } else {
                pricesAllRanges[N] = null
            }
        }

        return pricesAllRanges;
    }

    public async createLoanHealth(collateral: number | string, debt: number | string, range: number, full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        const _collateral = parseUnits(collateral, this.collateral_token.decimals);
        const _debt = parseUnits(debt, this.borrowed_token.decimals);

        const contract = lending.contracts[this.addresses.controller].contract;
        let _health = await contract.health_calculator(address, _collateral, _debt, full, range, lending.constantOptions) as bigint;
        _health = _health * BigInt(100);

        return formatUnits(_health);
    }

    public async createLoanIsApproved(collateral: number | string): Promise<boolean> {
        return await hasAllowance([this.collateral_token.address], [collateral], lending.signerAddress, this.addresses.controller);
    }

    private async createLoanApproveEstimateGas (collateral: number | string): Promise<TGas> {
        return await ensureAllowanceEstimateGas([this.collateral_token.address], [collateral], this.addresses.controller);
    }

    public async createLoanApprove(collateral: number | string): Promise<string[]> {
        return await ensureAllowance([this.collateral_token.address], [collateral], this.addresses.controller);
    }

    private async _createLoan(collateral: number | string, debt: number | string, range: number, estimateGas: boolean): Promise<string | TGas> {
        if (await this.userLoanExists()) throw Error("Loan already created");
        this._checkRange(range);

        const _collateral = parseUnits(collateral, this.collateral_token.decimals);
        const _debt = parseUnits(debt, this.borrowed_token.decimals);
        const contract = lending.contracts[this.addresses.controller].contract;
        const gas = await contract.create_loan.estimateGas(_collateral, _debt, range, { ...lending.constantOptions });
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(gas));
        return (await contract.create_loan(_collateral, _debt, range, { ...lending.options, gasLimit })).hash
    }

    public async createLoanEstimateGas(collateral: number | string, debt: number | string, range: number): Promise<TGas> {
        if (!(await this.createLoanIsApproved(collateral))) throw Error("Approval is needed for gas estimation");
        return await this._createLoan(collateral, debt,  range, true) as TGas;
    }

    public async createLoan(collateral: number | string, debt: number | string, range: number): Promise<string> {
        await this.createLoanApprove(collateral);
        return await this._createLoan(collateral, debt, range, false) as string;
    }

    // ---------------- BORROW MORE ----------------

    public async borrowMoreMaxRecv(collateralAmount: number | string): Promise<string> {
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState();
        const N = await this.userRange();
        const _collateral = _currentCollateral + parseUnits(collateralAmount, this.collateral_token.decimals);

        const contract = lending.contracts[this.addresses.controller].contract;
        const _debt: bigint = await contract.max_borrowable(_collateral, N, lending.constantOptions);

        return formatUnits(_debt - _currentDebt, this.borrowed_token.decimals);
    }

    private async _borrowMoreBands(collateral: number | string, debt: number | string): Promise<[bigint, bigint]> {
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState();
        if (_currentDebt === BigInt(0)) throw Error(`Loan for ${lending.signerAddress} does not exist`);

        const N = await this.userRange();
        const _collateral = _currentCollateral + parseUnits(collateral, this.collateral_token.decimals);
        const _debt = _currentDebt + parseUnits(debt, this.borrowed_token.decimals);

        const _n1 = await this._calcN1(_collateral, _debt, N);
        const _n2 = _n1 + BigInt(N - 1);

        return [_n2, _n1];
    }

    public async borrowMoreBands(collateral: number | string, debt: number | string): Promise<[number, number]> {
        const [_n2, _n1] = await this._borrowMoreBands(collateral, debt);

        return [Number(_n2), Number(_n1)];
    }

    public async borrowMorePrices(collateral: number | string, debt: number | string): Promise<string[]> {
        const [_n2, _n1] = await this._borrowMoreBands(collateral, debt);

        return await this._getPrices(_n2, _n1);
    }

    public async borrowMoreHealth(collateral: number | string, debt: number | string, full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        const _collateral = parseUnits(collateral, this.collateral_token.decimals);
        const _debt = parseUnits(debt, this.borrowed_token.decimals);

        const contract = lending.contracts[this.addresses.controller].contract;
        let _health = await contract.health_calculator(address, _collateral, _debt, full, 0, lending.constantOptions) as bigint;
        _health = _health * BigInt(100);

        return formatUnits(_health);
    }

    public async borrowMoreIsApproved(collateral: number | string): Promise<boolean> {
        return await hasAllowance([this.addresses.collateral_token], [collateral], lending.signerAddress, this.addresses.controller);
    }

    private async borrowMoreApproveEstimateGas (collateral: number | string): Promise<TGas> {
        return await ensureAllowanceEstimateGas([this.addresses.collateral_token], [collateral], this.addresses.controller);
    }

    public async borrowMoreApprove(collateral: number | string): Promise<string[]> {
        return await ensureAllowance([this.addresses.collateral_token], [collateral], this.addresses.controller);
    }

    private async _borrowMore(collateral: number | string, debt: number | string, estimateGas: boolean): Promise<string | TGas> {
        const { borrowed, debt: currentDebt } = await this.userState();
        if (Number(currentDebt) === 0) throw Error(`Loan for ${lending.signerAddress} does not exist`);
        if (Number(borrowed) > 0) throw Error(`User ${lending.signerAddress} is already in liquidation mode`);

        const _collateral = parseUnits(collateral, this.collateral_token.decimals);
        const _debt = parseUnits(debt, this.borrowed_token.decimals);
        const contract = lending.contracts[this.addresses.controller].contract;
        const gas = await contract.borrow_more.estimateGas(_collateral, _debt, { ...lending.constantOptions });
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(gas));
        return (await contract.borrow_more(_collateral, _debt, { ...lending.options, gasLimit })).hash
    }

    public async borrowMoreEstimateGas(collateral: number | string, debt: number | string): Promise<TGas> {
        if (!(await this.borrowMoreIsApproved(collateral))) throw Error("Approval is needed for gas estimation");
        return await this._borrowMore(collateral, debt, true) as TGas;
    }

    public async borrowMore(collateral: number | string, debt: number | string): Promise<string> {
        await this.borrowMoreApprove(collateral);
        return await this._borrowMore(collateral, debt, false) as string;
    }

    // ---------------- ADD COLLATERAL ----------------

    private async _addCollateralBands(collateral: number | string, address = ""): Promise<[bigint, bigint]> {
        address = _getAddress(address);
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState(address);
        if (_currentDebt === BigInt(0)) throw Error(`Loan for ${address} does not exist`);

        const N = await this.userRange(address);
        const _collateral = _currentCollateral + parseUnits(collateral, this.collateral_token.decimals);
        const _n1 = await this._calcN1(_collateral, _currentDebt, N);
        const _n2 = _n1 + BigInt(N - 1);

        return [_n2, _n1];
    }

    public async addCollateralBands(collateral: number | string, address = ""): Promise<[number, number]> {
        const [_n2, _n1] = await this._addCollateralBands(collateral, address);

        return [Number(_n2), Number(_n1)];
    }

    public async addCollateralPrices(collateral: number | string, address = ""): Promise<string[]> {
        const [_n2, _n1] = await this._addCollateralBands(collateral, address);

        return await this._getPrices(_n2, _n1);
    }

    public async addCollateralHealth(collateral: number | string, full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        const _collateral = parseUnits(collateral, this.collateral_token.decimals);

        const contract = lending.contracts[this.addresses.controller].contract;
        let _health = await contract.health_calculator(address, _collateral, 0, full, 0, lending.constantOptions) as bigint;
        _health = _health * BigInt(100);

        return formatUnits(_health);
    }

    public async addCollateralIsApproved(collateral: number | string): Promise<boolean> {
        return await hasAllowance([this.addresses.collateral_token], [collateral], lending.signerAddress, this.addresses.controller);
    }

    private async addCollateralApproveEstimateGas (collateral: number | string): Promise<TGas> {
        return await ensureAllowanceEstimateGas([this.addresses.collateral_token], [collateral], this.addresses.controller);
    }

    public async addCollateralApprove(collateral: number | string): Promise<string[]> {
        return await ensureAllowance([this.addresses.collateral_token], [collateral], this.addresses.controller);
    }

    private async _addCollateral(collateral: number | string, address: string, estimateGas: boolean): Promise<string | TGas> {
        const { borrowed, debt: currentDebt } = await this.userState(address);
        if (Number(currentDebt) === 0) throw Error(`Loan for ${address} does not exist`);
        if (Number(borrowed) > 0) throw Error(`User ${address} is already in liquidation mode`);

        const _collateral = parseUnits(collateral, this.collateral_token.decimals);
        const contract = lending.contracts[this.addresses.controller].contract;
        const gas = await contract.add_collateral.estimateGas(_collateral, address, { ...lending.constantOptions });
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(gas));
        return (await contract.add_collateral(_collateral, address, { ...lending.options, gasLimit })).hash
    }

    public async addCollateralEstimateGas(collateral: number | string, address = ""): Promise<TGas> {
        address = _getAddress(address);
        if (!(await this.addCollateralIsApproved(collateral))) throw Error("Approval is needed for gas estimation");
        return await this._addCollateral(collateral, address, true) as TGas;
    }

    public async addCollateral(collateral: number | string, address = ""): Promise<string> {
        address = _getAddress(address);
        await this.addCollateralApprove(collateral);
        return await this._addCollateral(collateral, address, false) as string;
    }

    // ---------------- REMOVE COLLATERAL ----------------

    public async maxRemovable(): Promise<string> {
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState();
        const N = await this.userRange();
        const _requiredCollateral = await lending.contracts[this.addresses.controller].contract.min_collateral(_currentDebt, N, lending.constantOptions)

        return formatUnits(_currentCollateral - _requiredCollateral, this.collateral_token.decimals);
    }

    private async _removeCollateralBands(collateral: number | string): Promise<[bigint, bigint]> {
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState();
        if (_currentDebt === BigInt(0)) throw Error(`Loan for ${lending.signerAddress} does not exist`);

        const N = await this.userRange();
        const _collateral = _currentCollateral - parseUnits(collateral, this.collateral_token.decimals);
        const _n1 = await this._calcN1(_collateral, _currentDebt, N);
        const _n2 = _n1 + BigInt(N - 1);

        return [_n2, _n1];
    }

    public async removeCollateralBands(collateral: number | string): Promise<[number, number]> {
        const [_n2, _n1] = await this._removeCollateralBands(collateral);

        return [Number(_n2), Number(_n1)];
    }

    public async removeCollateralPrices(collateral: number | string): Promise<string[]> {
        const [_n2, _n1] = await this._removeCollateralBands(collateral);

        return await this._getPrices(_n2, _n1);
    }

    public async removeCollateralHealth(collateral: number | string, full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        const _collateral = parseUnits(collateral, this.collateral_token.decimals) * BigInt(-1);

        const contract = lending.contracts[this.addresses.controller].contract;
        let _health = await contract.health_calculator(address, _collateral, 0, full, 0, lending.constantOptions) as bigint;
        _health = _health * BigInt(100);

        return formatUnits(_health);
    }

    private async _removeCollateral(collateral: number | string, estimateGas: boolean): Promise<string | TGas> {
        const { borrowed, debt: currentDebt } = await this.userState();
        if (Number(currentDebt) === 0) throw Error(`Loan for ${lending.signerAddress} does not exist`);
        if (Number(borrowed) > 0) throw Error(`User ${lending.signerAddress} is already in liquidation mode`);

        const _collateral = parseUnits(collateral, this.collateral_token.decimals);
        const contract = lending.contracts[this.addresses.controller].contract;
        const gas = await contract.remove_collateral.estimateGas(_collateral, lending.constantOptions);
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(gas));
        return (await contract.remove_collateral(_collateral, { ...lending.options, gasLimit })).hash
    }

    public async removeCollateralEstimateGas(collateral: number | string): Promise<TGas> {
        return await this._removeCollateral(collateral, true) as TGas;
    }

    public async removeCollateral(collateral: number | string): Promise<string> {
        return await this._removeCollateral(collateral, false) as string;
    }

    // ---------------- REPAY ----------------

    private async _repayBands(debt: number | string, address: string): Promise<[bigint, bigint]> {
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState(address);
        if (_currentDebt === BigInt(0)) throw Error(`Loan for ${address} does not exist`);

        const N = await this.userRange(address);
        const _debt = _currentDebt - parseUnits(debt, this.borrowed_token.decimals);
        const _n1 = await this._calcN1(_currentCollateral, _debt, N);
        const _n2 = _n1 + BigInt(N - 1);

        return [_n2, _n1];
    }

    public async repayBands(debt: number | string, address = ""): Promise<[number, number]> {
        const [_n2, _n1] = await this._repayBands(debt, address);

        return [Number(_n2), Number(_n1)];
    }

    public async repayPrices(debt: number | string, address = ""): Promise<string[]> {
        const [_n2, _n1] = await this._repayBands(debt, address);

        return await this._getPrices(_n2, _n1);
    }

    public async repayIsApproved(debt: number | string): Promise<boolean> {
        return await hasAllowance([this.borrowed_token.address], [debt], lending.signerAddress, this.addresses.controller);
    }

    private async repayApproveEstimateGas (debt: number | string): Promise<TGas> {
        return await ensureAllowanceEstimateGas([this.borrowed_token.address], [debt], this.addresses.controller);
    }

    public async repayApprove(debt: number | string): Promise<string[]> {
        return await ensureAllowance([this.borrowed_token.address], [debt], this.addresses.controller);
    }

    public async repayHealth(debt: number | string, full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        const _debt = parseUnits(debt) * BigInt(-1);

        const contract = lending.contracts[this.addresses.controller].contract;
        let _health = await contract.health_calculator(address, 0, _debt, full, 0, lending.constantOptions) as bigint;
        _health = _health * BigInt(100);

        return formatUnits(_health);
    }

    private async _repay(debt: number | string, address: string, estimateGas: boolean): Promise<string | TGas> {
        address = _getAddress(address);
        const { debt: currentDebt } = await this.userState(address);
        if (Number(currentDebt) === 0) throw Error(`Loan for ${address} does not exist`);

        const _debt = parseUnits(debt);
        const contract = lending.contracts[this.addresses.controller].contract;
        const [_, n1] = await this.userBands(address);
        const { borrowed } = await this.userState(address);
        const n = (BN(borrowed).gt(0)) ? MAX_ACTIVE_BAND : n1 - 1;  // In liquidation mode it doesn't matter if active band moves
        const gas = await contract.repay.estimateGas(_debt, address, n, lending.constantOptions);
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(gas));
        return (await contract.repay(_debt, address, n, { ...lending.options, gasLimit })).hash
    }

    public async repayEstimateGas(debt: number | string, address = ""): Promise<TGas> {
        if (!(await this.repayIsApproved(debt))) throw Error("Approval is needed for gas estimation");
        return await this._repay(debt, address, true) as TGas;
    }

    public async repay(debt: number | string, address = ""): Promise<string> {
        await this.repayApprove(debt);
        return await this._repay(debt, address, false) as string;
    }

    // ---------------- FULL REPAY ----------------

    private async _fullRepayAmount(address = ""): Promise<string> {
        address = _getAddress(address);
        const { debt } = await this.userState(address);
        return BN(debt).times(1.0001).toString();
    }

    public async fullRepayIsApproved(address = ""): Promise<boolean> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        return await this.repayIsApproved(fullRepayAmount);
    }

    private async fullRepayApproveEstimateGas (address = ""): Promise<TGas> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        return await this.repayApproveEstimateGas(fullRepayAmount);
    }

    public async fullRepayApprove(address = ""): Promise<string[]> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        return await this.repayApprove(fullRepayAmount);
    }

    public async fullRepayEstimateGas(address = ""): Promise<TGas> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        if (!(await this.repayIsApproved(fullRepayAmount))) throw Error("Approval is needed for gas estimation");
        return await this._repay(fullRepayAmount, address, true) as TGas;
    }

    public async fullRepay(address = ""): Promise<string> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        await this.repayApprove(fullRepayAmount);
        return await this._repay(fullRepayAmount, address, false) as string;
    }

    // ---------------- SWAP ----------------

    public async maxSwappable(i: number, j: number): Promise<string> {
        if (!(i === 0 && j === 1) && !(i === 1 && j === 0)) throw Error("Wrong index");
        const inDecimals = this.coinDecimals[i];
        const contract = lending.contracts[this.addresses.amm].contract;
        const [_inAmount, _outAmount] = await contract.get_dxdy(i, j, MAX_ALLOWANCE, lending.constantOptions) as bigint[];
        if (_outAmount === BigInt(0)) return "0";

        return formatUnits(_inAmount, inDecimals)
    }

    private async _swapExpected(i: number, j: number, _amount: bigint): Promise<bigint> {
        return await lending.contracts[this.addresses.amm].contract.get_dy(i, j, _amount, lending.constantOptions) as bigint;
    }

    public async swapExpected(i: number, j: number, amount: number | string): Promise<string> {
        if (!(i === 0 && j === 1) && !(i === 1 && j === 0)) throw Error("Wrong index");
        const [inDecimals, outDecimals] = this.coinDecimals;
        const _amount = parseUnits(amount, inDecimals);
        const _expected = await this._swapExpected(i, j, _amount);

        return formatUnits(_expected, outDecimals)
    }

    public async swapRequired(i: number, j: number, outAmount: number | string): Promise<string> {
        if (!(i === 0 && j === 1) && !(i === 1 && j === 0)) throw Error("Wrong index");
        const [inDecimals, outDecimals] = this.coinDecimals;
        const _amount = parseUnits(outAmount, outDecimals);
        const _expected = await lending.contracts[this.addresses.amm].contract.get_dx(i, j, _amount, lending.constantOptions) as bigint;

        return formatUnits(_expected, inDecimals)
    }

    public async swapPriceImpact(i: number, j: number, amount: number | string): Promise<string> {
        if (!(i === 0 && j === 1) && !(i === 1 && j === 0)) throw Error("Wrong index");
        const [inDecimals, outDecimals] = this.coinDecimals;
        const _amount = parseUnits(amount, inDecimals);
        const _output = await this._swapExpected(i, j, _amount);

        // Find k for which x * k = 10^15 or y * k = 10^15: k = max(10^15 / x, 10^15 / y)
        // For coins with d (decimals) <= 15: k = min(k, 0.2), and x0 = min(x * k, 10^d)
        // x0 = min(x * min(max(10^15 / x, 10^15 / y), 0.2), 10^d), if x0 == 0 then priceImpact = 0
        const target = BN(10 ** 15);
        const amountIntBN = BN(amount).times(10 ** inDecimals);
        const outputIntBN = toBN(_output, 0);
        const k = BigNumber.min(BigNumber.max(target.div(amountIntBN), target.div(outputIntBN)), 0.2);
        const smallAmountIntBN = BigNumber.min(amountIntBN.times(k), BN(10 ** inDecimals));
        if (smallAmountIntBN.toFixed(0) === '0') return '0';

        const _smallAmount = fromBN(smallAmountIntBN.div(10 ** inDecimals), inDecimals);
        const _smallOutput = await this._swapExpected(i, j, _smallAmount);

        const amountBN = BN(amount);
        const outputBN = toBN(_output, outDecimals);
        const smallAmountBN = toBN(_smallAmount, inDecimals);
        const smallOutputBN = toBN(_smallOutput, outDecimals);

        const rateBN = outputBN.div(amountBN);
        const smallRateBN = smallOutputBN.div(smallAmountBN);
        if (rateBN.gt(smallRateBN)) return "0";

        const slippageBN = BN(1).minus(rateBN.div(smallRateBN)).times(100);

        return _cutZeros(slippageBN.toFixed(6));
    }

    public async swapIsApproved(i: number, amount: number | string): Promise<boolean> {
        if (i !== 0 && i !== 1) throw Error("Wrong index");

        return await hasAllowance([this.coinAddresses[i]], [amount], lending.signerAddress, this.addresses.amm);
    }

    private async swapApproveEstimateGas (i: number, amount: number | string): Promise<TGas> {
        if (i !== 0 && i !== 1) throw Error("Wrong index");

        return await ensureAllowanceEstimateGas([this.coinAddresses[i]], [amount], this.addresses.amm);
    }

    public async swapApprove(i: number, amount: number | string): Promise<string[]> {
        if (i !== 0 && i !== 1) throw Error("Wrong index");

        return await ensureAllowance([this.coinAddresses[i]], [amount], this.addresses.amm);
    }

    private async _swap(i: number, j: number, amount: number | string, slippage: number, estimateGas: boolean): Promise<string | TGas> {
        if (!(i === 0 && j === 1) && !(i === 1 && j === 0)) throw Error("Wrong index");

        const [inDecimals, outDecimals] = [this.coinDecimals[i], this.coinDecimals[j]];
        const _amount = parseUnits(amount, inDecimals);
        const _expected = await this._swapExpected(i, j, _amount);
        const minRecvAmountBN: BigNumber = toBN(_expected, outDecimals).times(100 - slippage).div(100);
        const _minRecvAmount = fromBN(minRecvAmountBN, outDecimals);
        const contract = lending.contracts[this.addresses.amm].contract;
        const gas = await contract.exchange.estimateGas(i, j, _amount, _minRecvAmount, lending.constantOptions);
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(gas));
        return (await contract.exchange(i, j, _amount, _minRecvAmount, { ...lending.options, gasLimit })).hash
    }

    public async swapEstimateGas(i: number, j: number, amount: number | string, slippage = 0.1): Promise<TGas> {
        if (!(await this.swapIsApproved(i, amount))) throw Error("Approval is needed for gas estimation");
        return await this._swap(i, j, amount, slippage, true) as TGas;
    }

    public async swap(i: number, j: number, amount: number | string, slippage = 0.1): Promise<string> {
        await this.swapApprove(i, amount);
        return await this._swap(i, j, amount, slippage, false) as string;
    }

    // ---------------- LIQUIDATE ----------------

    public async tokensToLiquidate(address = ""): Promise<string> {
        address = _getAddress(address);
        const _tokens = await lending.contracts[this.addresses.controller].contract.tokens_to_liquidate(address, lending.constantOptions) as bigint;

        return formatUnits(_tokens, this.borrowed_token.decimals)
    }

    public async liquidateIsApproved(address = ""): Promise<boolean> {
        const tokensToLiquidate = await this.tokensToLiquidate(address);
        return await hasAllowance([this.addresses.borrowed_token], [tokensToLiquidate], lending.signerAddress, this.addresses.controller);
    }

    private async liquidateApproveEstimateGas (address = ""): Promise<TGas> {
        const tokensToLiquidate = await this.tokensToLiquidate(address);
        return await ensureAllowanceEstimateGas([this.addresses.borrowed_token], [tokensToLiquidate], this.addresses.controller);
    }

    public async liquidateApprove(address = ""): Promise<string[]> {
        const tokensToLiquidate = await this.tokensToLiquidate(address);
        return await ensureAllowance([this.addresses.borrowed_token], [tokensToLiquidate], this.addresses.controller);
    }

    private async _liquidate(address: string, slippage: number, estimateGas: boolean): Promise<string | TGas> {
        const { borrowed, debt: currentDebt } = await this.userState(address);
        if (slippage <= 0) throw Error("Slippage must be > 0");
        if (slippage > 100) throw Error("Slippage must be <= 100");
        if (Number(currentDebt) === 0) throw Error(`Loan for ${address} does not exist`);
        if (Number(borrowed) === 0) throw Error(`User ${address} is not in liquidation mode`);

        const minAmountBN: BigNumber = BN(borrowed).times(100 - slippage).div(100);
        const _minAmount = fromBN(minAmountBN);
        const contract = lending.contracts[this.addresses.controller].contract;
        const gas = (await contract.liquidate.estimateGas(address, _minAmount, lending.constantOptions))
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();
        const gasLimit = _mulBy1_3(DIGas(gas));
        return (await contract.liquidate(address, _minAmount, { ...lending.options, gasLimit })).hash
    }

    public async liquidateEstimateGas(address: string, slippage = 0.1): Promise<TGas> {
        if (!(await this.liquidateIsApproved(address))) throw Error("Approval is needed for gas estimation");
        return await this._liquidate(address, slippage, true) as TGas;
    }

    public async liquidate(address: string, slippage = 0.1): Promise<string> {
        await this.liquidateApprove(address);
        return await this._liquidate(address, slippage, false) as string;
    }

    // ---------------- SELF-LIQUIDATE ----------------

    public async selfLiquidateIsApproved(): Promise<boolean> {
        return await this.liquidateIsApproved()
    }

    private async selfLiquidateApproveEstimateGas (): Promise<TGas> {
        return this.liquidateApproveEstimateGas()
    }

    public async selfLiquidateApprove(): Promise<string[]> {
        return await this.liquidateApprove()
    }

    public async selfLiquidateEstimateGas(slippage = 0.1): Promise<TGas> {
        if (!(await this.selfLiquidateIsApproved())) throw Error("Approval is needed for gas estimation");
        return await this._liquidate(lending.signerAddress, slippage, true) as TGas;
    }

    public async selfLiquidate(slippage = 0.1): Promise<string> {
        await this.selfLiquidateApprove();
        return await this._liquidate(lending.signerAddress, slippage, false) as string;
    }
}
