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
    ensureAllowance,
    hasAllowance,
    ensureAllowanceEstimateGas,
    _cutZeros,
    formatUnits,
    formatNumber,
    MAX_ALLOWANCE,
    MAX_ACTIVE_BAND,
    _mulBy1_3,
    DIGas,
    smartNumber,
} from "../utils.js";
import {IDict, TGas} from "../interfaces.js";
import {TAmount} from "../interfaces";

export class OneWayMarketTemplate {
    id: string;
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
    coinDecimals: [number, number]
    coinAddresses: [string, string]
    defaultBands: number
    minBands: number
    maxBands: number

    estimateGas: {
        createLoanApprove: (collateral: number | string) => Promise<number | number[]>,
        createLoan: (collateral: number | string, debt: number | string, range: number) => Promise<number | number[]>,
        borrowMoreApprove: (collateral: number | string) => Promise<number | number[]>,
        borrowMore: (collateral: number | string, debt: number | string) => Promise<number | number[]>,
        addCollateralApprove: (collateral: number | string) => Promise<number | number[]>,
        addCollateral: (collateral: number | string, address?: string) => Promise<number | number[]>,
        removeCollateral: (collateral: number | string) => Promise<number | number[]>,
        repayApprove: (debt: number | string) => Promise<number | number[]>,
        repay: (debt: number | string, address?: string) => Promise<number | number[]>,
        fullRepayApprove: (address?: string) => Promise<number | number[]>,
        fullRepay: (address?: string) => Promise<number | number[]>,
        swapApprove: (i: number, amount: number | string) => Promise<number | number[]>,
        swap: (i: number, j: number, amount: number | string, slippage?: number) => Promise<number | number[]>,
        liquidateApprove: (address: string) => Promise<number | number[]>,
        liquidate: (address: string, slippage?: number) => Promise<number | number[]>,
        selfLiquidateApprove: () => Promise<number | number[]>,
        selfLiquidate: (slippage?: number) => Promise<number | number[]>,
    };
    stats: {
        parameters: () => Promise<{
            fee: string, // %
            admin_fee: string, // %
            rate: string, // %
            liquidation_discount: string, // %
            loan_discount: string, // %
        }>,
        balances: () => Promise<[string, string]>,
        maxMinBands: () => Promise<[number, number]>,
        activeBand:() => Promise<number>,
        liquidatingBand:() => Promise<number | null>,
        bandBalances:(n: number) => Promise<{ borrowed: string, collateral: string }>,
        bandsBalances: () => Promise<{ [index: number]: { borrowed: string, collateral: string } }>,
        totalBorrowed: () => Promise<string>,
        totalDebt: () => Promise<string>,
        ammBalances: () => Promise<{ borrowed: string, collateral: string }>,
        capAndAvailable: () => Promise<{ cap: string, available: string }>,
    };
    wallet: {
        balances: (address?: string) => Promise<{ collateral: string, borrowed: string, vaultShares: string }>,
    };

    vault: {
        deposit: (amount: TAmount) => Promise<string>,
        previewDeposit: (amount: TAmount) => Promise<string>,
        maxDeposit: () => Promise<string>,
        mint: (amount: TAmount) => Promise<string>,
        previewMint: (amount: TAmount) => Promise<string>,
        maxMint: () => Promise<string>,
        withdraw: (amount: TAmount) => Promise<string>,
        previewWithdraw: (amount: TAmount) => Promise<string>,
        maxWithdraw: () => Promise<string>,
        redeem: (amount: TAmount) => Promise<string>,
        previewRedeem: (amount: TAmount) => Promise<string>,
        maxRedeem: () => Promise<string>,
        estimateGas: {
            depositApprove: (amount: TAmount) => Promise<TGas>,
            deposit: (amount: TAmount) => Promise<TGas>,
        }
    };

    constructor(id: string) {
        this.id = id;
        const marketData = lending.constants.ONE_WAY_MARKETS[id];
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
            balances: this.statsBalances.bind(this),
            maxMinBands: this.statsMaxMinBands.bind(this),
            activeBand: this.statsActiveBand.bind(this),
            liquidatingBand: this.statsLiquidatingBand.bind(this),
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
            deposit: this.vaultDeposit.bind(this),
            previewDeposit: this.vaultPreviewDeposit.bind(this),
            maxDeposit: this.vaultMaxDeposit.bind(this),
            mint: this.vaultMint.bind(this),
            previewMint: this.vaultPreviewMint.bind(this),
            maxMint: this.vaultMaxMint.bind(this),
            withdraw: this.vaultWithdraw.bind(this),
            previewWithdraw: this.vaultPreviewWithdraw.bind(this),
            maxWithdraw: this.vaultMaxWithdraw.bind(this),
            redeem: this.vaultRedeem.bind(this),
            previewRedeem: this.vaultPreviewRedeem.bind(this),
            maxRedeem: this.vaultMaxRedeem.bind(this),
            estimateGas: {
                depositApprove: this.vaultDepositApproveEstimateGas.bind(this),
                deposit: this.vaultDepositEstimateGas.bind(this),
            },
        }

    }

    private async _vaultDeposit(amount: TAmount, estimateGas = false): Promise<string | TGas> {
        const _amount = parseUnits(amount, this.borrowed_token.decimals);
        const gas = await lending.contracts[this.addresses.vault].contract.deposit.estimateGas(_amount, { ...lending.constantOptions });
        if (estimateGas) return smartNumber(gas);

        await lending.updateFeeData();

        const gasLimit = _mulBy1_3(DIGas(gas));

        return (await lending.contracts[this.addresses.vault].contract.deposit(_amount, { ...lending.options, gasLimit })).hash;
    }

    public async vaultDepositIsApproved(borrowed: TAmount): Promise<boolean> {
        return await hasAllowance([this.borrowed_token.address], [borrowed], lending.signerAddress, this.addresses.vault);
    }

    private async vaultDepositApproveEstimateGas (borrowed: TAmount): Promise<TGas> {
        return await ensureAllowanceEstimateGas([this.borrowed_token.address], [borrowed], this.addresses.vault);
    }

    public async vaultDepositApprove(borrowed: TAmount): Promise<string[]> {
        return await ensureAllowance([this.borrowed_token.address], [borrowed], this.addresses.vault);
    }

    public async vaultDepositEstimateGas(amount: TAmount): Promise<TGas> {
        if (!(await this.vaultDepositIsApproved(amount))) throw Error("Approval is needed for gas estimation");
        return await this._vaultDeposit(amount, true) as number;
    }

    public async vaultDeposit(amount: TAmount): Promise<string> {
        await this.vaultDepositApprove(amount);
        return await this._vaultDeposit(amount, false) as string;
    }


    private async vaultPreviewDeposit(amount: TAmount, estimateGas = false): Promise<string> {
        const _amount = parseUnits(amount, this.borrowed_token.decimals);
        const _shares = await lending.contracts[this.addresses.vault].contract.previewDeposit(_amount);

        return formatUnits(_shares, 18);
    }

    private async vaultMaxDeposit(): Promise<string> {
        const _amount = await lending.contracts[this.addresses.vault].contract.maxDeposit();

        return formatUnits(_amount,  this.borrowed_token.decimals);
    }

    private async vaultMint(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, 18);
        const _assets = await lending.contracts[this.addresses.vault].contract.mint(_amount);

        return formatUnits(_assets, this.borrowed_token.decimals);
    }

    private async vaultPreviewMint(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, 18);
        const _assets = await lending.contracts[this.addresses.vault].contract.previewMint(_amount);

        return formatUnits(_assets, this.borrowed_token.decimals);
    }

    private async vaultMaxMint(): Promise<string> {
        const _shares = await lending.contracts[this.addresses.vault].contract.maxMint()

        return formatUnits(_shares, 18);
    }

    private async vaultWithdraw(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, this.borrowed_token.decimals);
        const _shares = await lending.contracts[this.addresses.vault].contract.withdraw(_amount);

        return formatUnits(_shares, 18);
    }

    private async vaultPreviewWithdraw(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, this.borrowed_token.decimals);
        const _shares = await lending.contracts[this.addresses.vault].contract.previewWithdraw(_amount);

        return formatUnits(_shares, 18);
    }

    private async vaultMaxWithdraw(): Promise<string> {
        const _assets = await lending.contracts[this.addresses.vault].contract.maxWithdraw();

        return formatUnits(_assets, this.borrowed_token.decimals);
    }

    private async vaultRedeem(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, 18);
        const _assets = await lending.contracts[this.addresses.vault].contract.redeem(_amount);

        return formatUnits(_assets, this.borrowed_token.decimals);
    }

    private async vaultPreviewRedeem(amount: TAmount): Promise<string> {
        const _amount = parseUnits(amount, 18);
        const _assets = await lending.contracts[this.addresses.vault].contract.previewRedeem(_amount);

        return formatUnits(_assets, this.borrowed_token.decimals);
    }

    private async vaultMaxRedeem(): Promise<string> {
        const _shares = await lending.contracts[this.addresses.vault].contract.maxRedeem()

        return formatUnits(_shares, 18);
    }

    // ---------------- STATS ----------------

    private statsParameters = memoize(async (): Promise<{
            fee: string, // %
            admin_fee: string, // %
            rate: string, // %
            future_rate: string, // %
            liquidation_discount: string, // %
            loan_discount: string, // %
            base_price: string,
            A: string,
        }> => {
        const llammaContract = lending.contracts[this.addresses.amm].multicallContract;
        const controllerContract = lending.contracts[this.addresses.controller].multicallContract;
        const monetaryPolicyContract = lending.contracts[this.addresses.monetary_policy].multicallContract;

        const calls = [
            llammaContract.fee(),
            llammaContract.admin_fee(),
            llammaContract.rate(),
            monetaryPolicyContract.rate(this.addresses.controller),
            controllerContract.liquidation_discount(),
            controllerContract.loan_discount(),
            llammaContract.get_base_price(),
            llammaContract.A(),
        ]

        const [_fee, _admin_fee, _rate, _mp_rate, _liquidation_discount, _loan_discount, _base_price, _A]: bigint[] = await lending.multicallProvider.all(calls) as bigint[];
        const A = formatUnits(_A, 0)
        const base_price = formatUnits(_base_price)
        const [fee, admin_fee, liquidation_discount, loan_discount] = [_fee, _admin_fee, _liquidation_discount, _loan_discount]
            .map((_x) => formatUnits(_x * BigInt(100)));

        // (1+rate)**(365*86400)-1 ~= (e**(rate*365*86400))-1
        const rate = String(((2.718281828459 ** (toBN(_rate).times(365).times(86400)).toNumber()) - 1) * 100);
        const future_rate = String(((2.718281828459 ** (toBN(_mp_rate).times(365).times(86400)).toNumber()) - 1) * 100);

        return { fee, admin_fee, rate, future_rate, liquidation_discount, loan_discount, base_price, A }
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

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

    private statsActiveBand = memoize(async (): Promise<number> => {
        return Number(await lending.contracts[this.addresses.amm].contract.active_band())
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

    private statsMaxMinBands = memoize(async (): Promise<[number, number]> => {
        const ammContract = lending.contracts[this.addresses.amm].multicallContract;

        const calls = [
            ammContract.max_band(),
            ammContract.min_band(),
        ]

        return (await lending.multicallProvider.all(calls) as bigint[]).map((_b) => Number(_b)) as [number, number];
    },
    {
        promise: true,
        maxAge: 60 * 1000, // 1m
    });

    private async statsLiquidatingBand(): Promise<number | null> {
        const activeBand = await this.statsActiveBand();
        const { borrowed, collateral } = await this.statsBandBalances(activeBand);
        if (Number(borrowed) > 0 && Number(collateral) > 0) return activeBand;
        return null
    }

    private async statsBandsBalances(): Promise<{ [index: number]: { borrowed: string, collateral: string } }> {
        const [max_band, min_band]: number[] = await this.statsMaxMinBands();

        const ammContract = lending.contracts[this.addresses.amm].multicallContract;
        const calls = [];
        for (let i = min_band; i <= max_band; i++) {
            calls.push(ammContract.bands_x(i), ammContract.bands_y(i));
        }

        const _bands: bigint[] = await lending.multicallProvider.all(calls);

        const bands: { [index: number]: { borrowed: string, collateral: string } } = {};
        for (let i = min_band; i <= max_band; i++) {
            const _i = i - min_band
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

    private async walletBalances(address = ""): Promise<{ collateral: string, borrowed: string, vaultShares: string }> {
        const [collateral, borrowed, vaultShares] = await getBalances([this.collateral_token.address, this.borrowed_token.address, this.addresses.vault], address);
        return { collateral, borrowed, vaultShares }
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
        return await this._createLoan(collateral, debt,  range, true) as number;
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

    private async borrowMoreApproveEstimateGas (collateral: number | string): Promise<number | number[]> {
        return await ensureAllowanceEstimateGas([this.addresses.collateral_token], [collateral], this.addresses.controller);
    }

    public async borrowMoreApprove(collateral: number | string): Promise<string[]> {
        return await ensureAllowance([this.addresses.collateral_token], [collateral], this.addresses.controller);
    }

    private async _borrowMore(collateral: number | string, debt: number | string, estimateGas: boolean): Promise<string | number | number[]> {
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

    public async borrowMoreEstimateGas(collateral: number | string, debt: number | string): Promise<number | number[]> {
        if (!(await this.borrowMoreIsApproved(collateral))) throw Error("Approval is needed for gas estimation");
        return await this._borrowMore(collateral, debt, true) as number | number[];
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

    private async addCollateralApproveEstimateGas (collateral: number | string): Promise<number | number[]> {
        return await ensureAllowanceEstimateGas([this.addresses.collateral_token], [collateral], this.addresses.controller);
    }

    public async addCollateralApprove(collateral: number | string): Promise<string[]> {
        return await ensureAllowance([this.addresses.collateral_token], [collateral], this.addresses.controller);
    }

    private async _addCollateral(collateral: number | string, address: string, estimateGas: boolean): Promise<string | number | number[]> {
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

    public async addCollateralEstimateGas(collateral: number | string, address = ""): Promise<number | number[]> {
        address = _getAddress(address);
        if (!(await this.addCollateralIsApproved(collateral))) throw Error("Approval is needed for gas estimation");
        return await this._addCollateral(collateral, address, true) as number | number[];
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

    private async _removeCollateral(collateral: number | string, estimateGas: boolean): Promise<string | number | number[]> {
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

    public async removeCollateralEstimateGas(collateral: number | string): Promise<number | number[]> {
        return await this._removeCollateral(collateral, true) as number | number[];
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

    private async repayApproveEstimateGas (debt: number | string): Promise<number | number[]> {
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

    private async _repay(debt: number | string, address: string, estimateGas: boolean): Promise<string | number | number[]> {
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

    public async repayEstimateGas(debt: number | string, address = ""): Promise<number | number[]> {
        if (!(await this.repayIsApproved(debt))) throw Error("Approval is needed for gas estimation");
        return await this._repay(debt, address, true) as number | number[];
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

    private async fullRepayApproveEstimateGas (address = ""): Promise<number | number[]> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        return await this.repayApproveEstimateGas(fullRepayAmount);
    }

    public async fullRepayApprove(address = ""): Promise<string[]> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        return await this.repayApprove(fullRepayAmount);
    }

    public async fullRepayEstimateGas(address = ""): Promise<number | number[]> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        if (!(await this.repayIsApproved(fullRepayAmount))) throw Error("Approval is needed for gas estimation");
        return await this._repay(fullRepayAmount, address, true) as number | number[];
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

    private async swapApproveEstimateGas (i: number, amount: number | string): Promise<number | number[]> {
        if (i !== 0 && i !== 1) throw Error("Wrong index");

        return await ensureAllowanceEstimateGas([this.coinAddresses[i]], [amount], this.addresses.amm);
    }

    public async swapApprove(i: number, amount: number | string): Promise<string[]> {
        if (i !== 0 && i !== 1) throw Error("Wrong index");

        return await ensureAllowance([this.coinAddresses[i]], [amount], this.addresses.amm);
    }

    private async _swap(i: number, j: number, amount: number | string, slippage: number, estimateGas: boolean): Promise<string | number | number[]> {
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

    public async swapEstimateGas(i: number, j: number, amount: number | string, slippage = 0.1): Promise<number | number[]> {
        if (!(await this.swapIsApproved(i, amount))) throw Error("Approval is needed for gas estimation");
        return await this._swap(i, j, amount, slippage, true) as number | number[];
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

    private async liquidateApproveEstimateGas (address = ""): Promise<number | number[]> {
        const tokensToLiquidate = await this.tokensToLiquidate(address);
        return await ensureAllowanceEstimateGas([this.addresses.borrowed_token], [tokensToLiquidate], this.addresses.controller);
    }

    public async liquidateApprove(address = ""): Promise<string[]> {
        const tokensToLiquidate = await this.tokensToLiquidate(address);
        return await ensureAllowance([this.addresses.borrowed_token], [tokensToLiquidate], this.addresses.controller);
    }

    private async _liquidate(address: string, slippage: number, estimateGas: boolean): Promise<string | number | number[]> {
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

    public async liquidateEstimateGas(address: string, slippage = 0.1): Promise<number | number[]> {
        if (!(await this.liquidateIsApproved(address))) throw Error("Approval is needed for gas estimation");
        return await this._liquidate(address, slippage, true) as number | number[];
    }

    public async liquidate(address: string, slippage = 0.1): Promise<string> {
        await this.liquidateApprove(address);
        return await this._liquidate(address, slippage, false) as string;
    }

    // ---------------- SELF-LIQUIDATE ----------------

    public async selfLiquidateIsApproved(): Promise<boolean> {
        return await this.liquidateIsApproved()
    }

    private async selfLiquidateApproveEstimateGas (): Promise<number | number[]> {
        return this.liquidateApproveEstimateGas()
    }

    public async selfLiquidateApprove(): Promise<string[]> {
        return await this.liquidateApprove()
    }

    public async selfLiquidateEstimateGas(slippage = 0.1): Promise<number | number[]> {
        if (!(await this.selfLiquidateIsApproved())) throw Error("Approval is needed for gas estimation");
        return await this._liquidate(lending.signerAddress, slippage, true) as number | number[];
    }

    public async selfLiquidate(slippage = 0.1): Promise<string> {
        await this.selfLiquidateApprove();
        return await this._liquidate(lending.signerAddress, slippage, false) as string;
    }
}
