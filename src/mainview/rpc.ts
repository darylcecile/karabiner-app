import { RPCType } from '../bun/type';
import { Electroview } from 'electrobun/view';

const rpc = Electroview.defineRPC<RPCType>({
	handlers: {}
});

export const electroview = new Electroview({ rpc });
