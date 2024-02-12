import { assert } from "chai";
import { lending } from "../src/lending.js";
import { getOneWayMarket, OneWayMarketTemplate } from "../src/markets/index.js";
import { BN } from "../src/utils.js";


const ONE_WAY_MARKETS = ['one-way-market-0'];

const vaultTest = (id: string) => {
    describe(`${id} vault test`, function () {
        let oneWayMarket: OneWayMarketTemplate;

        before(async function () {
            oneWayMarket = getOneWayMarket(id);
            const maxRedeem = await oneWayMarket.vault.maxRedeem();
            await oneWayMarket.vault.redeem(maxRedeem);
        });

        it("deposit", async function () {
            const initialBalances = await oneWayMarket.wallet.balances();
            const depositAmount = Number(await oneWayMarket.vault.maxDeposit()) / 2;
            const expectedShares = Number(await oneWayMarket.vault.previewDeposit(depositAmount));

            assert.deepStrictEqual(BN(initialBalances.borrowed).div(2), BN(depositAmount), "half of balance");

            await oneWayMarket.vault.deposit(depositAmount);

            const balances = await oneWayMarket.wallet.balances();

            assert.deepStrictEqual(BN(balances.borrowed).toString(), BN(initialBalances.borrowed).minus(BN(depositAmount)).toString(), 'assets');
            assert.deepStrictEqual(BN(balances.vaultShares).toString(), BN(initialBalances.vaultShares).plus(BN(expectedShares)).toString(), 'shares');
        });

        it("mint", async function () {
            const initialBalances = await oneWayMarket.wallet.balances();
            const mintAmount = Number(await oneWayMarket.vault.maxMint()) / 2;
            const expectedAssets = Number(await oneWayMarket.vault.previewMint(mintAmount));

            assert.deepStrictEqual(BN(initialBalances.vaultShares).div(2), BN(mintAmount), "half of shares");

            await oneWayMarket.vault.mint(mintAmount);

            const balances = await oneWayMarket.wallet.balances();

            assert.deepStrictEqual(BN(balances.borrowed).toString(), BN(initialBalances.borrowed).minus(BN(expectedAssets)).toString(), 'assets');
            assert.deepStrictEqual(BN(balances.vaultShares).toString(), BN(initialBalances.vaultShares).plus(BN(mintAmount)).toString(), 'shares');
        });

        it("redeem", async function () {
            const initialBalances = await oneWayMarket.wallet.balances();
            const redeemAmount = Number(await oneWayMarket.vault.maxRedeem()) / 2;
            const expectedAssets = Number(await oneWayMarket.vault.previewRedeem(redeemAmount));

            assert.deepStrictEqual(BN(initialBalances.vaultShares).div(2), BN(redeemAmount), "half of shares");

            await oneWayMarket.vault.redeem(redeemAmount);

            const balances = await oneWayMarket.wallet.balances();

            assert.deepStrictEqual(BN(balances.borrowed).toString(), BN(initialBalances.borrowed).plus(BN(expectedAssets)).toString(), 'assets');
            assert.deepStrictEqual(BN(balances.vaultShares).toString(), BN(initialBalances.vaultShares).minus(BN(redeemAmount)).toString(), 'shares');
        });

        it("withdraw", async function () {
            const initialBalances = await oneWayMarket.wallet.balances();
            const withdrawAmount = await oneWayMarket.vault.maxWithdraw();
            const expectedShares = await oneWayMarket.vault.previewWithdraw(withdrawAmount);

            assert.deepStrictEqual(initialBalances.vaultShares, expectedShares, "burn all shares");

            await oneWayMarket.vault.withdraw(withdrawAmount);

            const balances = await oneWayMarket.wallet.balances();

            assert.deepStrictEqual(BN(balances.borrowed).toString(), BN(initialBalances.borrowed).plus(BN(withdrawAmount)).toString(), 'assets');
            assert.deepStrictEqual(BN(balances.vaultShares).toString(), BN(initialBalances.vaultShares).minus(BN(expectedShares)).toString(), 'shares');
        });
    });
}

describe('Vault test', async function () {
    this.timeout(120000);

    before(async function () {
        await lending.init('JsonRpc', {},{ gasPrice: 0 });
        await lending.fetchMarkets();
    });

    for (const oneWayMarketId of ONE_WAY_MARKETS) {
        vaultTest(oneWayMarketId);
    }
})
