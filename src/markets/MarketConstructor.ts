import { OneWayMarketTemplate} from "./OneWayMarketTemplate.js";

export const getOneWayMarket = (oneWayMarketId: string): OneWayMarketTemplate => {
    return new OneWayMarketTemplate(oneWayMarketId)
}
