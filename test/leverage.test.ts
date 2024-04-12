import { assert } from "chai";
import lending from "../src/index.js";
import { API_KEY_1INCH } from "./rpcUrls.test.js";
import { getOneWayMarket, OneWayMarketTemplate } from "../src/markets/index.js";


const ONE_WAY_MARKETS = ['one-way-market-0'];

const generalTest = (id: string) => {
    describe(`${id} leverage test`, function () {
        let oneWayMarket: OneWayMarketTemplate;

        before(async function () {
            oneWayMarket = getOneWayMarket(id);
            if (Number(await oneWayMarket.vault.totalLiquidity()) === 0) {
                const maxDeposit = Number(await oneWayMarket.vault.maxDeposit()) * 0.7;
                await oneWayMarket.vault.deposit(maxDeposit);
            }
        });

        it('Leverage createLoan', async function () {
            const initialBalances = await oneWayMarket.wallet.balances();
            const loanExists = await oneWayMarket.userLoanExists();

            assert.isFalse(loanExists);
            assert.isAbove(Number(initialBalances.collateral), 0);
            assert.isAbove(Number(initialBalances.borrowed), 0);

            const collateralAmount = 0.5;
            const borrowedAmount = 1000;
            const N = 10;
            const { maxDebt } = await oneWayMarket.leverage.createLoanMaxRecv(collateralAmount, borrowedAmount, N);
            const debtAmount = (Number(maxDebt) / 2).toFixed(18);
            const createLoanBands = await oneWayMarket.leverage.createLoanBands(collateralAmount, borrowedAmount, debtAmount, N);
            const createLoanPrices = await oneWayMarket.leverage.createLoanPrices(collateralAmount, borrowedAmount, debtAmount, N);
            const createLoanFullHealth = await oneWayMarket.leverage.createLoanHealth(collateralAmount, borrowedAmount, debtAmount, N);
            const createLoanHealth = await oneWayMarket.leverage.createLoanHealth(collateralAmount, borrowedAmount, debtAmount, N, false);
            const { totalCollateral } = await oneWayMarket.leverage.createLoanExpectedCollateral(collateralAmount, borrowedAmount, debtAmount);

            await oneWayMarket.leverage.createLoan(collateralAmount, borrowedAmount, debtAmount, N, 1);

            const balances = await oneWayMarket.wallet.balances();
            const state = await oneWayMarket.userState();
            const userBands = await oneWayMarket.userBands();
            const userPrices = await oneWayMarket.userPrices();
            const fullHealth = await oneWayMarket.userHealth();
            const health = await oneWayMarket.userHealth(false);

            assert.equal(Number(createLoanBands[0]), Number(userBands[0]), 'band 0');
            assert.equal(Number(createLoanBands[1]), Number(userBands[1]), 'band 1');
            assert.approximately(Number(createLoanPrices[0]), Number(userPrices[0]), 1e-2, 'price 0');
            assert.approximately(Number(createLoanPrices[1]), Number(userPrices[1]), 1e-2, 'price 1');
            assert.approximately(Number(createLoanFullHealth), Number(fullHealth), 0.3, 'full health');
            assert.approximately(Number(createLoanHealth), Number(health), 0.1, 'health');
            assert.equal(Number(balances.collateral), Number(initialBalances.collateral) - Number(collateralAmount), 'wallet collateral');
            assert.equal(Number(balances.borrowed), Number(initialBalances.borrowed) - borrowedAmount, 'wallet stablecoin');
            assert.isAtMost(Math.abs(Number(state.collateral) - Number(totalCollateral)) / Number(totalCollateral), 1e-3, 'state collateral');
            assert.equal(Number(state.debt), Number(debtAmount), 'state debt');
        });

        it('Leverage borrowMore', async function () {
            const initialBalances = await oneWayMarket.wallet.balances();
            const initialState = await oneWayMarket.userState();
            const loanExists = await oneWayMarket.userLoanExists();

            assert.isTrue(loanExists);
            assert.isAbove(Number(initialBalances.collateral), 0);
            assert.isAbove(Number(initialBalances.borrowed), 0);

            const collateralAmount = 0.5;
            const borrowedAmount = 1000;
            const { maxDebt } = await oneWayMarket.leverage.borrowMoreMaxRecv(collateralAmount, borrowedAmount);
            const debtAmount = (Number(maxDebt) / 2).toFixed(18);
            const borrowMoreBands = await oneWayMarket.leverage.borrowMoreBands(collateralAmount, borrowedAmount, debtAmount);
            const borrowMorePrices = await oneWayMarket.leverage.borrowMorePrices(collateralAmount, borrowedAmount, debtAmount);
            const borrowMoreFullHealth = await oneWayMarket.leverage.borrowMoreHealth(collateralAmount, borrowedAmount, debtAmount);
            const borrowMoreHealth = await oneWayMarket.leverage.borrowMoreHealth(collateralAmount, borrowedAmount, debtAmount, false);
            const { totalCollateral } = await oneWayMarket.leverage.borrowMoreExpectedCollateral(collateralAmount, borrowedAmount, debtAmount);

            await oneWayMarket.leverage.borrowMore(collateralAmount, borrowedAmount, debtAmount,1);

            const balances = await oneWayMarket.wallet.balances();
            const state = await oneWayMarket.userState();
            const userBands = await oneWayMarket.userBands();
            const userPrices = await oneWayMarket.userPrices();
            const fullHealth = await oneWayMarket.userHealth();
            const health = await oneWayMarket.userHealth(false);

            assert.equal(Number(borrowMoreBands[0]), Number(userBands[0]), 'band 0');
            assert.equal(Number(borrowMoreBands[1]), Number(userBands[1]), 'band 1');
            assert.approximately(Number(borrowMorePrices[0]), Number(userPrices[0]), 1e-2, 'price 0');
            assert.approximately(Number(borrowMorePrices[1]), Number(userPrices[1]), 1e-2, 'price 1');
            assert.approximately(Number(borrowMoreFullHealth), Number(fullHealth), 0.2, 'full health');
            assert.approximately(Number(borrowMoreHealth), Number(health), 0.1, 'health');
            assert.equal(Number(balances.collateral), Number(initialBalances.collateral) - Number(collateralAmount), 'wallet collateral');
            assert.equal(Number(balances.borrowed), Number(initialBalances.borrowed) - borrowedAmount, 'wallet stablecoin');
            const collateralDiff = Number(state.collateral) - Number(initialState.collateral);
            assert.isAtMost(Math.abs(collateralDiff - Number(totalCollateral)) / Number(totalCollateral), 1e-3, 'state collateral');
            assert.approximately(Number(state.debt), Number(initialState.debt) + Number(debtAmount), 1e-3, 'state debt');
        });

        it('Leverage repay', async function () {
            const initialBalances = await oneWayMarket.wallet.balances();
            const initialState = await oneWayMarket.userState();
            const loanExists = await oneWayMarket.userLoanExists();

            assert.isTrue(loanExists);
            assert.isAbove(Number(initialBalances.collateral), 0);
            assert.isAbove(Number(initialBalances.borrowed), 0);

            const stateCollateralAmount = 0.3;
            const collateralAmount = 0.2;
            const borrowedAmount = 500;
            const repayBands = await oneWayMarket.leverage.repayBands(stateCollateralAmount, collateralAmount, borrowedAmount);
            const repayPrices = await oneWayMarket.leverage.repayPrices(stateCollateralAmount, collateralAmount, borrowedAmount);
            const repayFullHealth = await oneWayMarket.leverage.repayHealth(stateCollateralAmount, collateralAmount, borrowedAmount);
            const repayHealth = await oneWayMarket.leverage.repayHealth(stateCollateralAmount, collateralAmount, borrowedAmount, false);
            const { totalBorrowed } = await oneWayMarket.leverage.repayExpectedBorrowed(stateCollateralAmount, collateralAmount, borrowedAmount);

            await oneWayMarket.leverage.repay(stateCollateralAmount, collateralAmount, borrowedAmount, 1);

            const balances = await oneWayMarket.wallet.balances();
            const state = await oneWayMarket.userState();
            const userBands = await oneWayMarket.userBands();
            const userPrices = await oneWayMarket.userPrices();
            const fullHealth = await oneWayMarket.userHealth();
            const health = await oneWayMarket.userHealth(false);

            assert.equal(Number(repayBands[0]), Number(userBands[0]), 'band 0');
            assert.equal(Number(repayBands[1]), Number(userBands[1]), 'band 1');
            assert.approximately(Number(repayPrices[0]), Number(userPrices[0]), 1e-2, 'price 0');
            assert.approximately(Number(repayPrices[1]), Number(userPrices[1]), 1e-2, 'price 1');
            assert.approximately(Number(repayFullHealth), Number(fullHealth), 0.1, 'full health');
            assert.approximately(Number(repayHealth), Number(health), 0.1, 'health');
            assert.equal(Number(balances.collateral), Number(initialBalances.collateral) - Number(collateralAmount), 'wallet collateral');
            assert.equal(Number(balances.borrowed), Number(initialBalances.borrowed) - borrowedAmount, 'wallet stablecoin');
            assert.equal(Number(state.collateral), Number(initialState.collateral) - Number(stateCollateralAmount), 'state collateral');
            const debtDiff = Number(initialState.debt) - Number(state.debt);
            assert.isAtMost(Math.abs(debtDiff - Number(totalBorrowed)) / Number(totalBorrowed), 2e-3, 'state debt');
        });
    })
}

describe('Leverage test', async function () {
    this.timeout(120000);

    before(async function () {
        await lending.init('JsonRpc', {},{ gasPrice: 0 }, API_KEY_1INCH);
        await lending.oneWayfactory.fetchMarkets();
    });

    for (const oneWayMarketId of ONE_WAY_MARKETS) {
        generalTest(oneWayMarketId);
    }
})
