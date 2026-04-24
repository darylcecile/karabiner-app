

export abstract class AIProvider {

	abstract ask(question: string): Promise<string> 
	abstract askWithSession(question: string, sessionId: string): Promise<string>

}