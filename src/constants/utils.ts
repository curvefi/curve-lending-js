import {IDict} from "../interfaces";

export const lowerCaseValues = (dict: IDict<string>): IDict<string> =>
    Object.fromEntries(Object.entries(dict).map((entry) => [entry[0], entry[1].toLowerCase()]))
