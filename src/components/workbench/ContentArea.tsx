import { TitleBar } from "./TitleBar";
import { SideNav } from "./SideNav";
import { StatusBar } from './StatusBar';
import { FileTree } from "@pierre/trees";

export function ContentArea() {
	return (
		<div className="flex flex-col absolute inset-0">
			<TitleBar />
			<section className="flex flex-row flex-1">
				<SideNav>
					
				</SideNav>
				<main className="flex flex-1 bg-background mt-0 mx-1 mb-1 rounded-lg">

				</main>
			</section>
			<StatusBar />
		</div>
	)
}



