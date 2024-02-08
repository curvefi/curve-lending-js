import { ethers } from "ethers";
import memoize from "memoizee";
import { lending } from "../lending.js";
import BigNumber from "bignumber.js";
import {
    _getAddress,
    parseUnits,
    BN,
    toBN,
    fromBN,
    //getBalances,
    //ensureAllowance,
    //hasAllowance,
    //ensureAllowanceEstimateGas,
    isEth,
    _cutZeros,
    formatUnits,
    formatNumber,
    MAX_ALLOWANCE,
    MAX_ACTIVE_BAND,
} from "../utils.js";
import { IDict } from "../interfaces.js";
import { _getUserCollateral } from "../external-api.js";


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
    defaultBands: number

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

    constructor(id: string) {
        this.id = id;
        const marketData = lending.constants.ONE_WAY_MARKETS[id];
        this.addresses = marketData.addresses;
        this.borrowed_token = marketData.borrowed_token;
        this.collateral_token = marketData.collateral_token;
        this.defaultBands = 10

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
}

/*export class OneWayMarketTemplate {
    id: string;
    address: string;
    controller: string;
    monetaryPolicy: string;
    collateral: string;
    leverageZap: string;
    deleverageZap: string;
    healthCalculator: string | undefined;
    collateralSymbol: string;
    collateralDecimals: number;
    coins: string[];
    coinAddresses: string[];
    coinDecimals: number[];
    minBands: number;
    maxBands: number;
    defaultBands: number;
    A: number;
    tickSpace: number; // %
    estimateGas: {
        createLoanApprove: (collateral: number | string) => Promise<number>,
        createLoan: (collateral: number | string, debt: number | string, range: number) => Promise<number>,
        addCollateralApprove: (collateral: number | string) => Promise<number>,
        addCollateral: (collateral: number | string, address?: string) => Promise<number>,
        borrowMoreApprove: (collateral: number | string) => Promise<number>,
        borrowMore: (collateral: number | string, debt: number | string) => Promise<number>,
        repayApprove: (debt: number | string) => Promise<number>,
        repay: (debt: number | string, address?: string) => Promise<number>,
        fullRepayApprove: (address?: string) => Promise<number>,
        fullRepay: (address?: string) => Promise<number>,
        swapApprove: (i: number, amount: number | string) => Promise<number>,
        swap: (i: number, j: number, amount: number | string, slippage?: number) => Promise<number>,
        liquidateApprove: (address: string) => Promise<number>,
        liquidate: (address: string, slippage?: number) => Promise<number>,
        selfLiquidateApprove: () => Promise<number>,
        selfLiquidate: (slippage?: number) => Promise<number>,
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
        #activeBand:() => Promise<number>,
        liquidatingBand:() => Promise<number | null>,
        bandBalances:(n: number) => Promise<{ stablecoin: string, collateral: string }>,
        bandsBalances: () => Promise<{ [index: number]: { stablecoin: string, collateral: string } }>,
        totalSupply: () => Promise<string>,
        totalDebt: () => Promise<string>,
        totalStablecoin: () => Promise<string>,
        totalCollateral: () => Promise<string>,
        capAndAvailable: () => Promise<{ "cap": string, "available": string }>,
    };
    wallet: {
        balances: (address?: string) => Promise<{ stablecoin: string, collateral: string }>,
    };

    constructor(id: string) {

        const llammaData = lending.constants.LLAMMAS[id];

        this.id = id;
        this.address = llammaData.amm_address;
        this.controller = llammaData.controller_address;
        this.monetaryPolicy = llammaData.monetary_policy_address;
        this.collateral = llammaData.collateral_address;
        this.leverageZap = llammaData.leverage_zap;
        this.deleverageZap = llammaData.deleverage_zap;
        this.healthCalculator = llammaData.health_calculator_zap;
        this.collateralSymbol = llammaData.collateral_symbol;
        this.collateralDecimals = llammaData.collateral_decimals;
        this.coins = ["lending", llammaData.collateral_symbol];
        this.coinAddresses = [lending.address, llammaData.collateral_address];
        this.coinDecimals = [18, llammaData.collateral_decimals];
        this.minBands = llammaData.min_bands;
        this.maxBands = llammaData.max_bands;
        this.defaultBands = llammaData.default_bands;
        this.A = llammaData.A;
        this.tickSpace = 1 / llammaData.A * 100;
        this.estimateGas = {
            createLoanApprove: this.createLoanApproveEstimateGas.bind(this),
            createLoan: this.createLoanEstimateGas.bind(this),
            addCollateralApprove: this.addCollateralApproveEstimateGas.bind(this),
            addCollateral: this.addCollateralEstimateGas.bind(this),
            borrowMoreApprove: this.borrowMoreApproveEstimateGas.bind(this),
            borrowMore: this.borrowMoreEstimateGas.bind(this),
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
            #activeBand: this.statsActiveBand.bind(this),
            liquidatingBand: this.statsLiquidatingBand.bind(this),
            bandBalances: this.statsBandBalances.bind(this),
            bandsBalances: this.statsBandsBalances.bind(this),
            totalSupply: this.statsTotalSupply.bind(this),
            totalDebt: this.statsTotalDebt.bind(this),
            totalStablecoin: this.statsTotalStablecoin.bind(this),
            totalCollateral: this.statsTotalCollateral.bind(this),
            capAndAvailable: this.statsCapAndAvailable.bind(this),
        }
        this.wallet = {
            balances: this.walletBalances.bind(this),
        }
    }

    // ---------------------------------------

    public async loanExists(address = ""): Promise<boolean> {
        address = _getAddress(address);
        return  await lending.contracts[this.controller].contract.loan_exists(address, lending.constantOptions);
    }

    public async userDebt(address = ""): Promise<string> {
        address = _getAddress(address);
        const debt = await lending.contracts[this.controller].contract.debt(address, lending.constantOptions);

        return ethers.utils.formatUnits(debt);
    }

    public async userHealth(full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        let _health = await lending.contracts[this.controller].contract.health(address, full, lending.constantOptions) as bigint;
        _health = _health.mul(100);

        return ethers.utils.formatUnits(_health);
    }

    public async userBands(address = ""): Promise<number[]> {
        address = _getAddress(address);
        const _bands = await lending.contracts[this.address].contract.read_user_tick_numbers(address, lending.constantOptions) as bigint[];

        return _bands.map((_t) => _t.toNumber()).reverse();
    }

    public async userRange(address = ""): Promise<number> {
        const [n2, n1] = await this.userBands(address);
        if (n1 == n2) return 0;
        return n2 - n1 + 1;
    }

    public async userPrices(address = ""): Promise<string[]> {
        address = _getAddress(address);
        const _prices = await lending.contracts[this.controller].contract.user_prices(address, lending.constantOptions) as bigint[];

        return _prices.map((_p) =>ethers.utils.formatUnits(_p)).reverse();
    }

    public async _userState(address = ""): Promise<{ _collateral: bigint, _stablecoin: bigint, _debt: bigint }> {
        address = _getAddress(address);
        const contract = lending.contracts[this.controller].contract;
        const [_collateral, _stablecoin, _debt] = await contract.user_state(address, lending.constantOptions) as bigint[];

        return { _collateral, _stablecoin, _debt }
    }

    public async userState(address = ""): Promise<{ collateral: string, stablecoin: string, debt: string }> {
        const { _collateral, _stablecoin, _debt } = await this._userState(address);

        return {
            collateral: ethers.utils.formatUnits(_collateral, this.collateralDecimals),
            stablecoin: ethers.utils.formatUnits(_stablecoin),
            debt: ethers.utils.formatUnits(_debt),
        };
    }

    public async userLoss(userAddress = ""): Promise<{ deposited_collateral: string, current_collateral_estimation: string, loss: string, loss_pct: string }> {
        userAddress = _getAddress(userAddress);
        const [deposited_collateral, _current_collateral_estimation] = await Promise.all([
            _getUserCollateral(lending.constants.NETWORK_NAME, this.controller, userAddress, this.collateralDecimals),
            lending.contracts[this.address].contract.get_y_up(userAddress),
        ]);
        const current_collateral_estimation = lending.formatUnits(_current_collateral_estimation, this.collateralDecimals);
        if (BN(deposited_collateral).lte(0)) {
            return {
                deposited_collateral,
                current_collateral_estimation,
                loss: "0.0",
                loss_pct: "0.0",
            };
        }
        const loss = BN(deposited_collateral).minus(current_collateral_estimation).toString()
        const loss_pct = BN(loss).div(deposited_collateral).times(100).toString();

        return {
            deposited_collateral,
            current_collateral_estimation,
            loss,
            loss_pct,
        };
    }

    public async userBandsBalances(address = ""): Promise<IDict<{ stablecoin: string, collateral: string }>> {
        const [n2, n1] = await this.userBands(address);
        if (n1 == 0 && n2 == 0) return {};

        address = _getAddress(address);
        const contract = lending.contracts[this.address].contract;
        const [_stablecoins, _collaterals] = await contract.get_xy(address, lending.constantOptions) as [bigint[], bigint[]];

        const res: IDict<{ stablecoin: string, collateral: string }> = {};
        for (let i = n1; i <= n2; i++) {
            res[i] = {
                stablecoin: ethers.utils.formatUnits(_stablecoins[i - n1], 18),
                collateral: ethers.utils.formatUnits(_collaterals[i - n1], this.collateralDecimals),
            };
        }

        return res
    }

    // ---------------- WALLET BALANCES ----------------

    private async walletBalances(address = ""): Promise<{ collateral: string, stablecoin: string }> {
        const [collateral, stablecoin] = ['0','0']//await getBalances([this.collateral, lending.address], address);
        return { stablecoin, collateral }
    }

    // ---------------- CREATE LOAN ----------------

    private _checkRange(range: number): void {
        if (range < this.minBands) throw Error(`range must be >= ${this.minBands}`);
        if (range > this.maxBands) throw Error(`range must be <= ${this.maxBands}`);
    }

    public async createLoanMaxRecv(collateral: number | string, range: number): Promise<string> {
        this._checkRange(range);
        const _collateral = parseUnits(collateral, this.collateralDecimals);

        return ethers.utils.formatUnits(await lending.contracts[this.controller].contract.max_borrowable(_collateral, range, lending.constantOptions));
    }

    public createLoanMaxRecvAllRanges = memoize(async (collateral: number | string): Promise<{ [index: number]: string }> => {
        const _collateral = parseUnits(collateral, this.collateralDecimals);

        const calls = [];
        for (let N = this.minBands; N <= this.maxBands; N++) {
            calls.push(lending.contracts[this.controller].multicallContract.max_borrowable(_collateral, N));
        }
        const _amounts = await lending.multicallProvider.all(calls) as bigint[];

        const res: { [index: number]: string } = {};
        for (let N = this.minBands; N <= this.maxBands; N++) {
            res[N] = ethers.utils.formatUnits(_amounts[N - this.minBands]);
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
        return await lending.contracts[this.controller].contract.calculate_debt_n1(_collateral, _debt, range, lending.constantOptions);
    }

    private async _calcN1AllRanges(_collateral: bigint, _debt: bigint, maxN: number): Promise<bigint[]> {
        const calls = [];
        for (let N = this.minBands; N <= maxN; N++) {
            calls.push(lending.contracts[this.controller].multicallContract.calculate_debt_n1(_collateral, _debt, N));
        }
        return await lending.multicallProvider.all(calls) as bigint[];
    }

    private async _getPrices(_n2: bigint, _n1: bigint): Promise<string[]> {
        const contract = lending.contracts[this.address].multicallContract;
        return (await lending.multicallProvider.all([
            contract.p_oracle_down(_n2),
            contract.p_oracle_up(_n1),
        ]) as bigint[]).map((_p) => ethers.utils.formatUnits(_p));
    }

    private async _calcPrices(_n2: bigint, _n1: bigint): Promise<[string, string]> {
        return [await this.calcTickPrice(_n2.toNumber() + 1), await this.calcTickPrice(_n1.toNumber())];
    }

    private async _createLoanBands(collateral: number | string, debt: number | string, range: number): Promise<[bigint, bigint]> {
        const _n1 = await this._calcN1(parseUnits(collateral, this.collateralDecimals), parseUnits(debt), range);
        const _n2 = _n1.add(bigint.from(range - 1));

        return [_n2, _n1];
    }

    private async _createLoanBandsAllRanges(collateral: number | string, debt: number | string): Promise<{ [index: number]: [bigint, bigint] }> {
        const maxN = await this.getMaxRange(collateral, debt);
        const _n1_arr = await this._calcN1AllRanges(parseUnits(collateral, this.collateralDecimals), parseUnits(debt), maxN);
        const _n2_arr: bigint[] = [];
        for (let N = this.minBands; N <= maxN; N++) {
            _n2_arr.push(_n1_arr[N - this.minBands].add(bigint.from(N - 1)));
        }

        const res: { [index: number]: [bigint, bigint] } = {};
        for (let N = this.minBands; N <= maxN; N++) {
            res[N] = [_n2_arr[N - this.minBands], _n1_arr[N - this.minBands]];
        }

        return res;
    }

    public async createLoanBands(collateral: number | string, debt: number | string, range: number): Promise<[number, number]> {
        const [_n2, _n1] = await this._createLoanBands(collateral, debt, range);

        return [_n2.toNumber(), _n1.toNumber()];
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
        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const _debt = parseUnits(debt);

        const contract = lending.contracts[this.healthCalculator ?? this.controller].contract;
        let _health = await contract.health_calculator(address, _collateral, _debt, full, range, lending.constantOptions) as bigint;
        _health = _health.mul(100);

        return ethers.utils.formatUnits(_health);
    }

    public async createLoanIsApproved(collateral: number | string): Promise<boolean> {
        return true//await hasAllowance([this.collateral], [collateral], lending.signerAddress, this.controller);
    }

    private async createLoanApproveEstimateGas (collateral: number | string): Promise<number> {
        return 0//await ensureAllowanceEstimateGas([this.collateral], [collateral], this.controller);
    }

    public async createLoanApprove(collateral: number | string): Promise<string[]> {
        return ['true']//await ensureAllowance([this.collateral], [collateral], this.controller);
    }

    private async _createLoan(collateral: number | string, debt: number | string, range: number, estimateGas: boolean): Promise<string | number> {
        if (await this.loanExists()) throw Error("Loan already created");
        this._checkRange(range);

        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const _debt = parseUnits(debt);
        const contract = lending.contracts[this.controller].contract;
        const value = isEth(this.collateral) ? _collateral : lending.parseUnits("0");
        const gas = await contract.estimateGas.create_loan(_collateral, _debt, range, { ...lending.constantOptions, value });
        if (estimateGas) return gas.toNumber();

        await lending.updateFeeData();
        const gasLimit = gas.mul(130).div(100);
        return (await contract.create_loan(_collateral, _debt, range, { ...lending.options, gasLimit, value })).hash
    }

    public async createLoanEstimateGas(collateral: number | string, debt: number | string, range: number): Promise<number> {
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
        const _collateral = _currentCollateral.add(parseUnits(collateralAmount, this.collateralDecimals));

        const contract = lending.contracts[this.controller].contract;
        const _debt: bigint = await contract.max_borrowable(_collateral, N, lending.constantOptions);

        return ethers.utils.formatUnits(_debt.sub(_currentDebt));
    }

    private async _borrowMoreBands(collateral: number | string, debt: number | string): Promise<[bigint, bigint]> {
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState();
        if (_currentDebt.eq(0)) throw Error(`Loan for ${lending.signerAddress} does not exist`);

        const N = await this.userRange();
        const _collateral = _currentCollateral.add(parseUnits(collateral, this.collateralDecimals));
        const _debt = _currentDebt.add(parseUnits(debt));

        const _n1 = await this._calcN1(_collateral, _debt, N);
        const _n2 = _n1.add(N - 1);

        return [_n2, _n1];
    }

    public async borrowMoreBands(collateral: number | string, debt: number | string): Promise<[number, number]> {
        const [_n2, _n1] = await this._borrowMoreBands(collateral, debt);

        return [_n2.toNumber(), _n1.toNumber()];
    }

    public async borrowMorePrices(collateral: number | string, debt: number | string): Promise<string[]> {
        const [_n2, _n1] = await this._borrowMoreBands(collateral, debt);

        return await this._getPrices(_n2, _n1);
    }

    public async borrowMoreHealth(collateral: number | string, debt: number | string, full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const _debt = parseUnits(debt);

        const contract = lending.contracts[this.healthCalculator ?? this.controller].contract;
        let _health = await contract.health_calculator(address, _collateral, _debt, full, 0, lending.constantOptions) as bigint;
        _health = _health.mul(100);

        return ethers.utils.formatUnits(_health);
    }

    public async borrowMoreIsApproved(collateral: number | string): Promise<boolean> {
        return true//await hasAllowance([this.collateral], [collateral], lending.signerAddress, this.controller);
    }

    private async borrowMoreApproveEstimateGas (collateral: number | string): Promise<number> {
        return 0//await ensureAllowanceEstimateGas([this.collateral], [collateral], this.controller);
    }

    public async borrowMoreApprove(collateral: number | string): Promise<string[]> {
        return ['true']//await ensureAllowance([this.collateral], [collateral], this.controller);
    }

    private async _borrowMore(collateral: number | string, debt: number | string, estimateGas: boolean): Promise<string | number> {
        const { stablecoin, debt: currentDebt } = await this.userState();
        if (Number(currentDebt) === 0) throw Error(`Loan for ${lending.signerAddress} does not exist`);
        if (Number(stablecoin) > 0) throw Error(`User ${lending.signerAddress} is already in liquidation mode`);

        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const _debt = parseUnits(debt);
        const contract = lending.contracts[this.controller].contract;
        const value = isEth(this.collateral) ? _collateral : lending.parseUnits("0");
        const gas = await contract.estimateGas.borrow_more(_collateral, _debt, { ...lending.constantOptions, value });
        if (estimateGas) return gas.toNumber();

        await lending.updateFeeData();
        const gasLimit = gas.mul(130).div(100);
        return (await contract.borrow_more(_collateral, _debt, { ...lending.options, gasLimit, value })).hash
    }

    public async borrowMoreEstimateGas(collateral: number | string, debt: number | string): Promise<number> {
        if (!(await this.borrowMoreIsApproved(collateral))) throw Error("Approval is needed for gas estimation");
        return await this._borrowMore(collateral, debt, true) as number;
    }

    public async borrowMore(collateral: number | string, debt: number | string): Promise<string> {
        await this.borrowMoreApprove(collateral);
        return await this._borrowMore(collateral, debt, false) as string;
    }

    // ---------------- ADD COLLATERAL ----------------

    private async _addCollateralBands(collateral: number | string, address = ""): Promise<[bigint, bigint]> {
        address = _getAddress(address);
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState(address);
        if (_currentDebt.eq(0)) throw Error(`Loan for ${address} does not exist`);

        const N = await this.userRange(address);
        const _collateral = _currentCollateral.add(parseUnits(collateral, this.collateralDecimals));
        const _n1 = await this._calcN1(_collateral, _currentDebt, N);
        const _n2 = _n1.add(N - 1);

        return [_n2, _n1];
    }

    public async addCollateralBands(collateral: number | string, address = ""): Promise<[number, number]> {
        const [_n2, _n1] = await this._addCollateralBands(collateral, address);

        return [_n2.toNumber(), _n1.toNumber()];
    }

    public async addCollateralPrices(collateral: number | string, address = ""): Promise<string[]> {
        const [_n2, _n1] = await this._addCollateralBands(collateral, address);

        return await this._getPrices(_n2, _n1);
    }

    public async addCollateralHealth(collateral: number | string, full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        const _collateral = parseUnits(collateral, this.collateralDecimals);

        const contract = lending.contracts[this.healthCalculator ?? this.controller].contract;
        let _health = await contract.health_calculator(address, _collateral, 0, full, 0, lending.constantOptions) as bigint;
        _health = _health.mul(100);

        return ethers.utils.formatUnits(_health);
    }

    public async addCollateralIsApproved(collateral: number | string): Promise<boolean> {
        return true//await hasAllowance([this.collateral], [collateral], lending.signerAddress, this.controller);
    }

    private async addCollateralApproveEstimateGas (collateral: number | string): Promise<number> {
        return 0//await ensureAllowanceEstimateGas([this.collateral], [collateral], this.controller);
    }

    public async addCollateralApprove(collateral: number | string): Promise<string[]> {
        return ['true']//await ensureAllowance([this.collateral], [collateral], this.controller);
    }

    private async _addCollateral(collateral: number | string, address: string, estimateGas: boolean): Promise<string | number> {
        const { stablecoin, debt: currentDebt } = await this.userState(address);
        if (Number(currentDebt) === 0) throw Error(`Loan for ${address} does not exist`);
        if (Number(stablecoin) > 0) throw Error(`User ${address} is already in liquidation mode`);

        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const contract = lending.contracts[this.controller].contract;
        const value = isEth(this.collateral) ? _collateral : lending.parseUnits("0");
        const gas = await contract.estimateGas.add_collateral(_collateral, address, { ...lending.constantOptions, value });
        if (estimateGas) return gas.toNumber();

        await lending.updateFeeData();
        const gasLimit = gas.mul(130).div(100);
        return (await contract.add_collateral(_collateral, address, { ...lending.options, gasLimit, value })).hash
    }

    public async addCollateralEstimateGas(collateral: number | string, address = ""): Promise<number> {
        address = _getAddress(address);
        if (!(await this.addCollateralIsApproved(collateral))) throw Error("Approval is needed for gas estimation");
        return await this._addCollateral(collateral, address, true) as number;
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
        const _requiredCollateral = await lending.contracts[this.controller].contract.min_collateral(_currentDebt, N, lending.constantOptions)

        return ethers.utils.formatUnits(_currentCollateral.sub(_requiredCollateral), this.collateralDecimals);
    }

    private async _removeCollateralBands(collateral: number | string): Promise<[bigint, bigint]> {
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState();
        if (_currentDebt.eq(0)) throw Error(`Loan for ${lending.signerAddress} does not exist`);

        const N = await this.userRange();
        const _collateral = _currentCollateral.sub(parseUnits(collateral, this.collateralDecimals));
        const _n1 = await this._calcN1(_collateral, _currentDebt, N);
        const _n2 = _n1.add(N - 1);

        return [_n2, _n1];
    }

    public async removeCollateralBands(collateral: number | string): Promise<[number, number]> {
        const [_n2, _n1] = await this._removeCollateralBands(collateral);

        return [_n2.toNumber(), _n1.toNumber()];
    }

    public async removeCollateralPrices(collateral: number | string): Promise<string[]> {
        const [_n2, _n1] = await this._removeCollateralBands(collateral);

        return await this._getPrices(_n2, _n1);
    }

    public async removeCollateralHealth(collateral: number | string, full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        const _collateral = parseUnits(collateral, this.collateralDecimals).mul(-1);

        const contract = lending.contracts[this.healthCalculator ?? this.controller].contract;
        let _health = await contract.health_calculator(address, _collateral, 0, full, 0, lending.constantOptions) as bigint;
        _health = _health.mul(100);

        return ethers.utils.formatUnits(_health);
    }

    private async _removeCollateral(collateral: number | string, estimateGas: boolean): Promise<string | number> {
        const { stablecoin, debt: currentDebt } = await this.userState();
        if (Number(currentDebt) === 0) throw Error(`Loan for ${lending.signerAddress} does not exist`);
        if (Number(stablecoin) > 0) throw Error(`User ${lending.signerAddress} is already in liquidation mode`);

        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const contract = lending.contracts[this.controller].contract;
        const gas = await contract.estimateGas.remove_collateral(_collateral, isEth(this.collateral), lending.constantOptions);
        if (estimateGas) return gas.toNumber();

        await lending.updateFeeData();
        const gasLimit = gas.mul(130).div(100);
        return (await contract.remove_collateral(_collateral, isEth(this.collateral), { ...lending.options, gasLimit })).hash
    }

    public async removeCollateralEstimateGas(collateral: number | string): Promise<number> {
        return await this._removeCollateral(collateral, true) as number;
    }

    public async removeCollateral(collateral: number | string): Promise<string> {
        return await this._removeCollateral(collateral, false) as string;
    }

    // ---------------- REPAY ----------------

    private async _repayBands(debt: number | string, address: string): Promise<[bigint, bigint]> {
        const { _collateral: _currentCollateral, _debt: _currentDebt } = await this._userState(address);
        if (_currentDebt.eq(0)) throw Error(`Loan for ${address} does not exist`);

        const N = await this.userRange(address);
        const _debt = _currentDebt.sub(parseUnits(debt));
        const _n1 = await this._calcN1(_currentCollateral, _debt, N);
        const _n2 = _n1.add(N - 1);

        return [_n2, _n1];
    }

    public async repayBands(debt: number | string, address = ""): Promise<[number, number]> {
        const [_n2, _n1] = await this._repayBands(debt, address);

        return [_n2.toNumber(), _n1.toNumber()];
    }

    public async repayPrices(debt: number | string, address = ""): Promise<string[]> {
        const [_n2, _n1] = await this._repayBands(debt, address);

        return await this._getPrices(_n2, _n1);
    }

    public async repayIsApproved(debt: number | string): Promise<boolean> {
        return true//await hasAllowance([lending.address], [debt], lending.signerAddress, this.controller);
    }

    private async repayApproveEstimateGas (debt: number | string): Promise<number> {
        return 0//await ensureAllowanceEstimateGas([lending.address], [debt], this.controller);
    }

    public async repayApprove(debt: number | string): Promise<string[]> {
        return ['0']//await ensureAllowance([lending.address], [debt], this.controller);
    }

    public async repayHealth(debt: number | string, full = true, address = ""): Promise<string> {
        address = _getAddress(address);
        const _debt = parseUnits(debt).mul(-1);

        const contract = lending.contracts[this.healthCalculator ?? this.controller].contract;
        let _health = await contract.health_calculator(address, 0, _debt, full, 0, lending.constantOptions) as bigint;
        _health = _health.mul(100);

        return ethers.utils.formatUnits(_health);
    }

    private async _repay(debt: number | string, address: string, estimateGas: boolean): Promise<string | number> {
        address = _getAddress(address);
        const { debt: currentDebt } = await this.userState(address);
        if (Number(currentDebt) === 0) throw Error(`Loan for ${address} does not exist`);

        const _debt = parseUnits(debt);
        const contract = lending.contracts[this.controller].contract;
        const [_, n1] = await this.userBands(address);
        const { stablecoin } = await this.userState(address);
        const n = (BN(stablecoin).gt(0)) ? MAX_ACTIVE_BAND : n1 - 1;  // In liquidation mode it doesn't matter if active band moves
        const gas = await contract.estimateGas.repay(_debt, address, n, isEth(this.collateral), lending.constantOptions);
        if (estimateGas) return gas.toNumber();

        await lending.updateFeeData();
        const gasLimit = gas.mul(130).div(100);
        return (await contract.repay(_debt, address, n, isEth(this.collateral), { ...lending.options, gasLimit })).hash
    }

    public async repayEstimateGas(debt: number | string, address = ""): Promise<number> {
        if (!(await this.repayIsApproved(debt))) throw Error("Approval is needed for gas estimation");
        return await this._repay(debt, address, true) as number;
    }

    public async repay(debt: number | string, address = ""): Promise<string> {
        await this.repayApprove(debt);
        return await this._repay(debt, address, false) as string;
    }

    // ---------------- FULL REPAY ----------------

    private async _fullRepayAmount(address = ""): Promise<string> {
        address = _getAddress(address);
        const debt = await this.userDebt(address);
        return BN(debt).times(1.0001).toString();
    }

    public async fullRepayIsApproved(address = ""): Promise<boolean> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        return await this.repayIsApproved(fullRepayAmount);
    }

    private async fullRepayApproveEstimateGas (address = ""): Promise<number> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        return await this.repayApproveEstimateGas(fullRepayAmount);
    }

    public async fullRepayApprove(address = ""): Promise<string[]> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        return await this.repayApprove(fullRepayAmount);
    }

    public async fullRepayEstimateGas(address = ""): Promise<number> {
        address = _getAddress(address);
        const fullRepayAmount = await this._fullRepayAmount(address);
        if (!(await this.repayIsApproved(fullRepayAmount))) throw Error("Approval is needed for gas estimation");
        return await this._repay(fullRepayAmount, address, true) as number;
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
        const contract = lending.contracts[this.address].contract;
        const [_inAmount, _outAmount] = await contract.get_dxdy(i, j, MAX_ALLOWANCE, lending.constantOptions) as bigint[];
        if (_outAmount.eq(0)) return "0";

        return ethers.utils.formatUnits(_inAmount, inDecimals)
    }

    private async _swapExpected(i: number, j: number, _amount: bigint): Promise<bigint> {
        return await lending.contracts[this.address].contract.get_dy(i, j, _amount, lending.constantOptions) as bigint;
    }

    public async swapExpected(i: number, j: number, amount: number | string): Promise<string> {
        if (!(i === 0 && j === 1) && !(i === 1 && j === 0)) throw Error("Wrong index");
        const [inDecimals, outDecimals] = this.coinDecimals;
        const _amount = parseUnits(amount, inDecimals);
        const _expected = await this._swapExpected(i, j, _amount);

        return ethers.utils.formatUnits(_expected, outDecimals)
    }

    public async swapRequired(i: number, j: number, outAmount: number | string): Promise<string> {
        if (!(i === 0 && j === 1) && !(i === 1 && j === 0)) throw Error("Wrong index");
        const [inDecimals, outDecimals] = this.coinDecimals;
        const _amount = parseUnits(outAmount, outDecimals);
        const _expected = await lending.contracts[this.address].contract.get_dx(i, j, _amount, lending.constantOptions) as bigint;

        return ethers.utils.formatUnits(_expected, inDecimals)
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

        return true//await hasAllowance([this.coinAddresses[i]], [amount], lending.signerAddress, this.address);
    }

    private async swapApproveEstimateGas (i: number, amount: number | string): Promise<number> {
        if (i !== 0 && i !== 1) throw Error("Wrong index");

        return 0//await ensureAllowanceEstimateGas([this.coinAddresses[i]], [amount], this.address);
    }

    public async swapApprove(i: number, amount: number | string): Promise<string[]> {
        if (i !== 0 && i !== 1) throw Error("Wrong index");

        return ['']//await ensureAllowance([this.coinAddresses[i]], [amount], this.address);
    }

    private async _swap(i: number, j: number, amount: number | string, slippage: number, estimateGas: boolean): Promise<string | number> {
        if (!(i === 0 && j === 1) && !(i === 1 && j === 0)) throw Error("Wrong index");

        const [inDecimals, outDecimals] = [this.coinDecimals[i], this.coinDecimals[j]];
        const _amount = parseUnits(amount, inDecimals);
        const _expected = await this._swapExpected(i, j, _amount);
        const minRecvAmountBN: BigNumber = toBN(_expected, outDecimals).times(100 - slippage).div(100);
        const _minRecvAmount = fromBN(minRecvAmountBN, outDecimals);
        const contract = lending.contracts[this.address].contract;
        const gas = await contract.estimateGas.exchange(i, j, _amount, _minRecvAmount, lending.constantOptions);
        if (estimateGas) return gas.toNumber();

        await lending.updateFeeData();
        const gasLimit = gas.mul(130).div(100);
        return (await contract.exchange(i, j, _amount, _minRecvAmount, { ...lending.options, gasLimit })).hash
    }

    public async swapEstimateGas(i: number, j: number, amount: number | string, slippage = 0.1): Promise<number> {
        if (!(await this.swapIsApproved(i, amount))) throw Error("Approval is needed for gas estimation");
        return await this._swap(i, j, amount, slippage, true) as number;
    }

    public async swap(i: number, j: number, amount: number | string, slippage = 0.1): Promise<string> {
        await this.swapApprove(i, amount);
        return await this._swap(i, j, amount, slippage, false) as string;
    }

    // ---------------- LIQUIDATE ----------------

    public async tokensToLiquidate(address = ""): Promise<string> {
        address = _getAddress(address);
        const _tokens = await lending.contracts[this.controller].contract.tokens_to_liquidate(address, lending.constantOptions) as bigint;

        return ethers.utils.formatUnits(_tokens)
    }

    public async liquidateIsApproved(address = ""): Promise<boolean> {
        const tokensToLiquidate = await this.tokensToLiquidate(address);
        return true//await hasAllowance([lending.address], [tokensToLiquidate], lending.signerAddress, this.controller);
    }

    private async liquidateApproveEstimateGas (address = ""): Promise<number> {
        const tokensToLiquidate = await this.tokensToLiquidate(address);
        return 0//await ensureAllowanceEstimateGas([lending.address], [tokensToLiquidate], this.controller);
    }

    public async liquidateApprove(address = ""): Promise<string[]> {
        const tokensToLiquidate = await this.tokensToLiquidate(address);
        return ['w']//await ensureAllowance([lending.address], [tokensToLiquidate], this.controller);
    }

    private async _liquidate(address: string, slippage: number, estimateGas: boolean): Promise<string | number> {
        const { stablecoin, debt: currentDebt } = await this.userState(address);
        if (slippage <= 0) throw Error("Slippage must be > 0");
        if (slippage > 100) throw Error("Slippage must be <= 100");
        if (Number(currentDebt) === 0) throw Error(`Loan for ${address} does not exist`);
        if (Number(stablecoin) === 0) throw Error(`User ${address} is not in liquidation mode`);

        const minAmountBN: BigNumber = BN(stablecoin).times(100 - slippage).div(100);
        const _minAmount = fromBN(minAmountBN);
        const contract = lending.contracts[this.controller].contract;
        const gas = (await contract.estimateGas.liquidate(address, _minAmount, isEth(this.collateral), lending.constantOptions))
        if (estimateGas) return gas.toNumber();

        await lending.updateFeeData();
        const gasLimit = gas.mul(130).div(100);
        return (await contract.liquidate(address, _minAmount, isEth(this.collateral), { ...lending.options, gasLimit })).hash
    }

    public async liquidateEstimateGas(address: string, slippage = 0.1): Promise<number> {
        if (!(await this.liquidateIsApproved(address))) throw Error("Approval is needed for gas estimation");
        return await this._liquidate(address, slippage, true) as number;
    }

    public async liquidate(address: string, slippage = 0.1): Promise<string> {
        await this.liquidateApprove(address);
        return await this._liquidate(address, slippage, false) as string;
    }

    // ---------------- SELF-LIQUIDATE ----------------

    public async selfLiquidateIsApproved(): Promise<boolean> {
        return await this.liquidateIsApproved()
    }

    private async selfLiquidateApproveEstimateGas (): Promise<number> {
        return this.liquidateApproveEstimateGas()
    }

    public async selfLiquidateApprove(): Promise<string[]> {
        return await this.liquidateApprove()
    }

    public async selfLiquidateEstimateGas(slippage = 0.1): Promise<number> {
        if (!(await this.selfLiquidateIsApproved())) throw Error("Approval is needed for gas estimation");
        return await this._liquidate(lending.signerAddress, slippage, true) as number;
    }

    public async selfLiquidate(slippage = 0.1): Promise<string> {
        await this.selfLiquidateApprove();
        return await this._liquidate(lending.signerAddress, slippage, false) as string;
    }

    // ---------------- CREATE LOAN WITH LEVERAGE ----------------

    private _getBestIdx(_amounts: bigint[]): number {
        let bestIdx = 0;
        for (let i = 1; i < 5; i++) {
            if (_amounts[i].gt(_amounts[bestIdx])) bestIdx = i;
        }

        return bestIdx
    }

    private _checkLeverageZap(): void {
        if (this.leverageZap === "0x0000000000000000000000000000000000000000") throw Error(`There is no leverage for ${this.id} market`)
    }

    private async leverageCreateLoanMaxRecv(collateral: number | string, range: number):
        Promise<{ maxBorrowable: string, maxCollateral: string, leverage: string, routeIdx: number }> {
        this._checkLeverageZap();
        this._checkRange(range);
        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const calls = [];
        for (let i = 0; i < 5; i++) {
            calls.push(lending.contracts[this.leverageZap].multicallContract.max_borrowable_and_collateral(_collateral, range, i));
        }
        const _res: bigint[][] = await lending.multicallProvider.all(calls);
        const _maxBorrowable = _res.map((r) => r[0].mul(999).div(1000));
        const _maxCollateral = _res.map((r) => r[1].mul(999).div(1000));
        const routeIdx = this._getBestIdx(_maxCollateral);

        const maxBorrowable = lending.formatUnits(_maxBorrowable[routeIdx]);
        const maxCollateral = lending.formatUnits(_maxCollateral[routeIdx], this.collateralDecimals);
        return {
            maxBorrowable,
            maxCollateral,
            leverage: BN(maxCollateral).div(collateral).toFixed(4),
            routeIdx,
        };
    }

    private leverageCreateLoanMaxRecvAllRanges = memoize(async (collateral: number | string):
        Promise<IDict<{ maxBorrowable: string, maxCollateral: string, leverage: string, routeIdx: number }>> => {
        this._checkLeverageZap();
        const _collateral = parseUnits(collateral, this.collateralDecimals);

        const calls = [];
        for (let N = this.minBands; N <= this.maxBands; N++) {
            for (let i = 0; i < 5; i++) {
                calls.push(lending.contracts[this.leverageZap].multicallContract.max_borrowable_and_collateral(_collateral, N, i));
            }
        }
        const _rawRes: bigint[][] = await lending.multicallProvider.all(calls);

        const res: IDict<{ maxBorrowable: string, maxCollateral: string, leverage: string, routeIdx: number }> = {};
        for (let N = this.minBands; N <= this.maxBands; N++) {
            const _res = _rawRes.splice(0, 5);
            const _maxBorrowable = _res.map((r) => r[0].mul(999).div(1000));
            const _maxCollateral = _res.map((r) => r[1].mul(999).div(1000));
            const routeIdx = this._getBestIdx(_maxCollateral);
            const maxBorrowable = lending.formatUnits(_maxBorrowable[routeIdx]);
            const maxCollateral = lending.formatUnits(_maxCollateral[routeIdx], this.collateralDecimals);
            res[N] = {
                maxBorrowable,
                maxCollateral,
                leverage: BN(maxCollateral).div(collateral).toFixed(4),
                routeIdx,
            };
        }

        return res;
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

    private _leverageCreateLoanMaxRecvAllRanges2 = memoize(async (collateral: number | string, routeIdx: number):
        Promise<IDict<{ maxBorrowable: string, maxCollateral: string, leverage: string}>> => {
        const _collateral = parseUnits(collateral, this.collateralDecimals);

        const calls = [];
        for (let N = this.minBands; N <= this.maxBands; N++) {
            calls.push(lending.contracts[this.leverageZap].multicallContract.max_borrowable_and_collateral(_collateral, N, routeIdx));
        }
        const _res: bigint[][] = await lending.multicallProvider.all(calls);

        const res: IDict<{ maxBorrowable: string, maxCollateral: string, leverage: string }> = {};
        for (let N = this.minBands; N <= this.maxBands; N++) {
            const maxBorrowable = lending.formatUnits(_res[N - this.minBands][0].mul(999).div(1000));
            const maxCollateral = lending.formatUnits(_res[N - this.minBands][1].mul(999).div(1000), this.collateralDecimals);
            res[N] = {
                maxBorrowable,
                maxCollateral,
                leverage: BN(maxCollateral).div(collateral).toFixed(4),
            };
        }

        return res;
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

    private _leverageCreateLoanCollateral = memoize(async (userCollateral: number | string, debt: number | string):
    Promise<{ _collateral: bigint, routeIdx: number }> => {
        const _userCollateral = parseUnits(userCollateral, this.collateralDecimals);
        const _debt = parseUnits(debt);
        const calls = [];
        for (let i = 0; i < 5; i++) {
            calls.push(lending.contracts[this.leverageZap].multicallContract.get_collateral(_debt, i));
        }
        const _leverageCollateral: bigint[] = await lending.multicallProvider.all(calls);
        const routeIdx = this._getBestIdx(_leverageCollateral);

        return { _collateral: _userCollateral.add(_leverageCollateral[routeIdx]), routeIdx }
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

    private async _getRouteIdx(userCollateral: number | string, debt: number | string): Promise<number> {
        const { routeIdx } = await this._leverageCreateLoanCollateral(userCollateral, debt);

        return routeIdx;
    }

    private async leverageCreateLoanCollateral(userCollateral: number | string, debt: number | string):
        Promise<{ collateral: string, leverage: string, routeIdx: number }> {
        this._checkLeverageZap();
        const { _collateral, routeIdx } = await this._leverageCreateLoanCollateral(userCollateral, debt);
        const collateral = lending.formatUnits(_collateral, this.collateralDecimals);

        return { collateral, leverage: BN(collateral).div(userCollateral).toFixed(4), routeIdx };
    }

    private async leverageGetRouteName(routeIdx: number): Promise<string> {
        this._checkLeverageZap();
        return await lending.contracts[this.leverageZap].contract.route_names(routeIdx);
    }

    private async leverageGetMaxRange(collateral: number | string, debt: number | string): Promise<number> {
        this._checkLeverageZap();
        const routeIdx = await this._getRouteIdx(collateral, debt);
        const maxRecv = await this._leverageCreateLoanMaxRecvAllRanges2(collateral, routeIdx);
        for (let N = this.minBands; N <= this.maxBands; N++) {
            if (BN(debt).gt(BN(maxRecv[N].maxBorrowable))) return N - 1;
        }

        return this.maxBands;
    }

    private async _leverageCalcN1(collateral: number | string, debt: number | string, range: number): Promise<bigint> {
        this._checkRange(range);
        const routeIdx = await this._getRouteIdx(collateral, debt);
        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const _debt = parseUnits(debt);
        return await lending.contracts[this.leverageZap].contract.calculate_debt_n1(_collateral, _debt, range, routeIdx, lending.constantOptions);
    }

    private async _leverageCalcN1AllRanges(collateral: number | string, debt: number | string, maxN: number): Promise<bigint[]> {
        const routeIdx = await this._getRouteIdx(collateral, debt);
        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const _debt = parseUnits(debt);
        const calls = [];
        for (let N = this.minBands; N <= maxN; N++) {
            calls.push(lending.contracts[this.leverageZap].multicallContract.calculate_debt_n1(_collateral, _debt, N, routeIdx));
        }
        return await lending.multicallProvider.all(calls) as bigint[];
    }

    private async _leverageCreateLoanBands(collateral: number | string, debt: number | string, range: number): Promise<[bigint, bigint]> {
        const _n1 = await this._leverageCalcN1(collateral, debt, range);
        const _n2 = _n1.add(bigint.from(range - 1));

        return [_n2, _n1];
    }

    private async _leverageCreateLoanBandsAllRanges(collateral: number | string, debt: number | string): Promise<IDict<[bigint, bigint]>> {
        const maxN = await this.leverageGetMaxRange(collateral, debt);
        const _n1_arr = await this._leverageCalcN1AllRanges(collateral, debt, maxN);
        const _n2_arr: bigint[] = [];
        for (let N = this.minBands; N <= maxN; N++) {
            _n2_arr.push(_n1_arr[N - this.minBands].add(bigint.from(N - 1)));
        }

        const _bands: IDict<[bigint, bigint]> = {};
        for (let N = this.minBands; N <= maxN; N++) {
            _bands[N] = [_n2_arr[N - this.minBands], _n1_arr[N - this.minBands]];
        }

        return _bands;
    }

    private async leverageCreateLoanBands(collateral: number | string, debt: number | string, range: number): Promise<[number, number]> {
        this._checkLeverageZap();
        const [_n2, _n1] = await this._leverageCreateLoanBands(collateral, debt, range);

        return [_n2.toNumber(), _n1.toNumber()];
    }

    private async leverageCreateLoanBandsAllRanges(collateral: number | string, debt: number | string): Promise<IDict<[number, number] | null>> {
        this._checkLeverageZap();
        const _bands = await this._leverageCreateLoanBandsAllRanges(collateral, debt);

        const bands: { [index: number]: [number, number] | null } = {};
        for (let N = this.minBands; N <= this.maxBands; N++) {
            if (_bands[N]) {
                bands[N] = _bands[N].map(Number) as [number, number];
            } else {
                bands[N] = null
            }
        }

        return bands;
    }

    private async leverageCreateLoanPrices(collateral: number | string, debt: number | string, range: number): Promise<string[]> {
        this._checkLeverageZap();
        const [_n2, _n1] = await this._leverageCreateLoanBands(collateral, debt, range);

        return await this._getPrices(_n2, _n1);
    }

    private async leverageCreateLoanPricesAllRanges(collateral: number | string, debt: number | string): Promise<IDict<[string, string] | null>> {
        this._checkLeverageZap();
        const _bands = await this._leverageCreateLoanBandsAllRanges(collateral, debt);

        const prices: { [index: number]: [string, string] | null } = {};
        for (let N = this.minBands; N <= this.maxBands; N++) {
            if (_bands[N]) {
                prices[N] = await this._calcPrices(..._bands[N]);
            } else {
                prices[N] = null
            }
        }

        return prices;
    }

    private async leverageCreateLoanHealth(collateral: number | string, debt: number | string, range: number, full = true): Promise<string> {
        this._checkLeverageZap();
        const address = "0x0000000000000000000000000000000000000000";
        const { _collateral } = await this._leverageCreateLoanCollateral(collateral, debt);
        const _debt = parseUnits(debt);

        const contract = lending.contracts[this.healthCalculator ?? this.controller].contract;
        let _health = await contract.health_calculator(address, _collateral, _debt, full, range, lending.constantOptions) as bigint;
        _health = _health.mul(100);

        return ethers.utils.formatUnits(_health);
    }

    public async leveragePriceImpact(collateral: number | string, debt: number | string): Promise<string> {
        const x_BN = BN(debt);
        const small_x_BN = BN(100);
        const { _collateral, routeIdx } = await this._leverageCreateLoanCollateral(collateral, debt);
        const _y = _collateral.sub(parseUnits(collateral, this.collateralDecimals));
        const _small_y = await lending.contracts[this.leverageZap].contract.get_collateral(fromBN(small_x_BN), routeIdx);
        const y_BN = toBN(_y, this.collateralDecimals);
        const small_y_BN = toBN(_small_y, this.collateralDecimals);
        const rateBN = y_BN.div(x_BN);
        const smallRateBN = small_y_BN.div(small_x_BN);
        if (rateBN.gt(smallRateBN)) return "0.0";

        return BN(1).minus(rateBN.div(smallRateBN)).times(100).toFixed(4);
    }

    private async _leverageCreateLoan(collateral: number | string, debt: number | string, range: number, slippage: number, estimateGas: boolean): Promise<string | number> {
        if (await this.loanExists()) throw Error("Loan already created");
        this._checkRange(range);

        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const _debt = parseUnits(debt);
        const leverageContract = lending.contracts[this.leverageZap].contract;
        const routeIdx = await this._getRouteIdx(collateral, debt);
        const _expected = await leverageContract.get_collateral_underlying(_debt, routeIdx, lending.constantOptions);
        const minRecvBN = toBN(_expected, this.collateralDecimals).times(100 - slippage).div(100);
        const _minRecv = fromBN(minRecvBN, this.collateralDecimals);
        const contract = lending.contracts[this.controller].contract;
        const value = isEth(this.collateral) ? _collateral : lending.parseUnits("0");
        const gas = await contract.estimateGas.create_loan_extended(
            _collateral,
            _debt,
            range,
            this.leverageZap,
            [routeIdx, _minRecv],
            { ...lending.constantOptions, value }
        );
        if (estimateGas) return gas.toNumber();

        await lending.updateFeeData();
        const gasLimit = gas.mul(130).div(100);
        return (await contract.create_loan_extended(
            _collateral,
            _debt,
            range,
            this.leverageZap,
            [routeIdx, _minRecv],
            { ...lending.options, gasLimit, value }
        )).hash
    }

    private async leverageCreateLoanEstimateGas(collateral: number | string, debt: number | string, range: number, slippage = 0.1): Promise<number> {
        this._checkLeverageZap();
        if (!(await this.createLoanIsApproved(collateral))) throw Error("Approval is needed for gas estimation");
        return await this._leverageCreateLoan(collateral, debt,  range, slippage,  true) as number;
    }

    private async leverageCreateLoan(collateral: number | string, debt: number | string, range: number, slippage = 0.1): Promise<string> {
        this._checkLeverageZap();
        await this.createLoanApprove(collateral);
        return await this._leverageCreateLoan(collateral, debt, range, slippage, false) as string;
    }

    // ---------------- DELEVERAGE REPAY ----------------

    private _checkDeleverageZap(): void {
        if (this.deleverageZap === "0x0000000000000000000000000000000000000000") throw Error(`There is no deleverage for ${this.id} market`)
    }

    private deleverageRepayStablecoins = memoize( async (collateral: number | string): Promise<{ stablecoins: string, routeIdx: number }> => {
        this._checkDeleverageZap();
        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const calls = [];
        for (let i = 0; i < 5; i++) {
            calls.push(lending.contracts[this.deleverageZap].multicallContract.get_stablecoins(_collateral, i));
        }
        const _stablecoins_arr: bigint[] = await lending.multicallProvider.all(calls);
        const routeIdx = this._getBestIdx(_stablecoins_arr);
        const stablecoins = lending.formatUnits(_stablecoins_arr[routeIdx]);

        return { stablecoins, routeIdx };
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

    private async deleverageGetRouteName(routeIdx: number): Promise<string> {
        this._checkDeleverageZap();
        return await lending.contracts[this.deleverageZap].contract.route_names(routeIdx);
    }

    private async deleverageIsFullRepayment(deleverageCollateral: number | string, address = ""): Promise<boolean> {
        address = _getAddress(address);
        const { stablecoin, debt } = await this.userState(address);
        const { stablecoins: deleverageStablecoins } = await this.deleverageRepayStablecoins(deleverageCollateral);

        return BN(stablecoin).plus(deleverageStablecoins).gt(debt);
    }

    private async deleverageIsAvailable(deleverageCollateral: number | string, address = ""): Promise<boolean> {
        // 0. const { collateral, stablecoin, debt } = await this.userState(address);
        // 1. maxCollateral for deleverage is collateral from line above (0).
        // 2. If user is underwater (stablecoin > 0), only full repayment is available:
        //    await this.deleverageRepayStablecoins(deleverageCollateral) + stablecoin > debt

        // There is no deleverage zap
        if (this.deleverageZap === "0x0000000000000000000000000000000000000000") return false;

        address = _getAddress(address);
        const { collateral, stablecoin, debt } = await this.userState(address);
        // Loan does not exist
        if (BN(debt).eq(0)) return false;
        // Can't spend more than user has
        if (BN(deleverageCollateral).gt(collateral)) return false;
        // Only full repayment and closing the position is available if user is underwater+
        if (BN(stablecoin).gt(0)) return await this.deleverageIsFullRepayment(deleverageCollateral, address);

        return true;
    }

    private _deleverageRepayBands = memoize( async (collateral: number | string, address: string): Promise<[bigint, bigint]> => {
        address = _getAddress(address);
        if (!(await this.deleverageIsAvailable(collateral, address))) return [parseUnits(0, 0), parseUnits(0, 0)];
        const { routeIdx } = await this.deleverageRepayStablecoins(collateral);
        const { _debt: _currentDebt } = await this._userState(address);
        if (_currentDebt.eq(0)) throw Error(`Loan for ${address} does not exist`);

        const N = await this.userRange(address);
        const _collateral = parseUnits(collateral, this.collateralDecimals);
        let _n1 = parseUnits(0, 0);
        let _n2 = parseUnits(0, 0);
        try {
            _n1 = await lending.contracts[this.deleverageZap].contract.calculate_debt_n1(_collateral, routeIdx, address);
            _n2 = _n1.add(N - 1);
        } catch (e) {
            console.log("Full repayment");
        }

        return [_n2, _n1];
    },
    {
        promise: true,
        maxAge: 5 * 60 * 1000, // 5m
    });

    private async deleverageRepayBands(collateral: number | string, address = ""): Promise<[number, number]> {
        this._checkDeleverageZap();
        const [_n2, _n1] = await this._deleverageRepayBands(collateral, address);

        return [_n2.toNumber(), _n1.toNumber()];
    }

    private async deleverageRepayPrices(debt: number | string, address = ""): Promise<string[]> {
        this._checkDeleverageZap();
        const [_n2, _n1] = await this._deleverageRepayBands(debt, address);

        return await this._getPrices(_n2, _n1);
    }

    private async deleverageRepayHealth(collateral: number | string, full = true, address = ""): Promise<string> {
        this._checkDeleverageZap();
        address = _getAddress(address);
        if (!(await this.deleverageIsAvailable(collateral, address))) return "0.0";
        const { _stablecoin, _debt } = await this._userState(address);
        const { stablecoins: deleverageStablecoins } = await this.deleverageRepayStablecoins(collateral);
        const _d_collateral = parseUnits(collateral, this.collateralDecimals).mul(-1);
        const _d_debt = parseUnits(deleverageStablecoins).add(_stablecoin).mul(-1);
        const N = await this.userRange(address);

        if (_debt.add(_d_debt).lt(0)) return "0.0";
        const contract = lending.contracts[this.healthCalculator ?? this.controller].contract;
        let _health = await contract.health_calculator(address, _d_collateral, _d_debt, full, N, lending.constantOptions) as bigint;
        _health = _health.mul(100);

        return ethers.utils.formatUnits(_health);
    }

    public async deleveragePriceImpact(collateral: number | string): Promise<string> {
        const x_BN = BN(collateral);
        const small_x_BN = BN(0.001);
        const { stablecoins, routeIdx } = await this.deleverageRepayStablecoins(collateral);
        const _y = parseUnits(stablecoins);
        const _small_y = await lending.contracts[this.deleverageZap].contract.get_stablecoins(fromBN(small_x_BN, this.collateralDecimals), routeIdx);
        const y_BN = toBN(_y);
        const small_y_BN = toBN(_small_y);
        const rateBN = y_BN.div(x_BN);
        const smallRateBN = small_y_BN.div(small_x_BN);
        if (rateBN.gt(smallRateBN)) return "0.0";

        return BN(1).minus(rateBN.div(smallRateBN)).times(100).toFixed(4);
    }

    private async _deleverageRepay(collateral: number | string, slippage: number, estimateGas: boolean): Promise<string | number> {
        const { debt: currentDebt } = await this.userState(lending.signerAddress);
        if (Number(currentDebt) === 0) throw Error(`Loan for ${lending.signerAddress} does not exist`);

        const { stablecoins, routeIdx } = await this.deleverageRepayStablecoins(collateral);
        const _collateral = parseUnits(collateral, this.collateralDecimals);
        const _debt = parseUnits(stablecoins);
        const minRecvBN = toBN(_debt).times(100 - slippage).div(100);
        const _minRecv = fromBN(minRecvBN);
        const contract = lending.contracts[this.controller].contract;
        const gas = await contract.estimateGas.repay_extended(this.deleverageZap, [routeIdx, _collateral, _minRecv], lending.constantOptions);
        if (estimateGas) return gas.toNumber();

        await lending.updateFeeData();
        const gasLimit = gas.mul(130).div(100);
        return (await contract.repay_extended(this.deleverageZap, [routeIdx, _collateral, _minRecv], { ...lending.options, gasLimit })).hash
    }

    private async deleverageRepayEstimateGas(collateral: number | string, slippage = 0.1): Promise<number> {
        this._checkDeleverageZap();
        return await this._deleverageRepay(collateral, slippage, true) as number;
    }

    private async deleverageRepay(collateral: number | string, slippage = 0.1): Promise<string> {
        this._checkDeleverageZap();
        return await this._deleverageRepay(collateral, slippage, false) as string;
    }
}
*/