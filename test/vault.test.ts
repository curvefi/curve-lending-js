import { assert } from "chai";
import { lending } from "../src/lending.js";
import { getOneWayMarket, OneWayMarketTemplate } from "../src/markets/index.js";
import { BN, ensureAllowance, getAllowance } from "../src/utils.js";


const ONE_WAY_MARKETS = ['one-way-market-0'];

const vaultTest = (id: string) => {
    describe(`${id} vault test`, function () {
        let oneWayMarket: OneWayMarketTemplate;

        before(async function () {
            oneWayMarket = getOneWayMarket(id);
        });

        it("deposit", async function () {
            const initialBalances = await oneWayMarket.wallet.balances();
            const depositAmount = 5000;
            const expected = Number(await oneWayMarket.vault.previewDeposit(depositAmount));

            console.log(await ensureAllowance([oneWayMarket.borrowed_token.address], [depositAmount], oneWayMarket.addresses.vault, true));
            await oneWayMarket.vault.deposit(depositAmount);

            const balances = await oneWayMarket.wallet.balances();

            assert.deepStrictEqual(BN(balances.borrowed).toString(), BN(initialBalances.borrowed).minus(BN(depositAmount)).toString(), 'in');
            assert.deepStrictEqual(BN(balances.vaultShares).toString(), BN(initialBalances.vaultShares).plus(BN(expected)).toString(), 'in');
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
